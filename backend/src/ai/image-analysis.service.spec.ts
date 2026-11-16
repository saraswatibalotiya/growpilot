import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiOutputInvalidError, type ClaudeProviderService } from './claude-provider.service';
import { ImageAnalysisService } from './image-analysis.service';
import { PromptBuilderService } from './prompt-builder.service';
import { FakeProvider } from './test-helpers';

const URL_OK = 'https://res.cloudinary.com/democloud/image/upload/v1/growpilot/biz-1/photo.png';
const analysis = { productType: 'kurti', colours: ['pink'], positioning: 'on a hanger', lighting: 'bright', background: 'plain white wall', orientation: 'portrait', quality: 'good', recommendations: ['Crop slightly closer'] };

function build(env: Record<string, string> = { CLOUDINARY_CLOUD_NAME: 'democloud' }, asset: Record<string, unknown> | null = { businessId: 'biz-1', mimeType: 'image/png', bytes: 200_000 }) {
  const provider = new FakeProvider();
  const media = { findBySecureUrl: jest.fn().mockResolvedValue(asset) };
  const service = new ImageAnalysisService(new ConfigService(env), provider as unknown as ClaudeProviderService, new PromptBuilderService(), media as never);
  return { provider, media, service };
}

describe('ImageAnalysisService', () => {
  it('analyses an uploaded product photo (Sonnet vision) and returns structured results', async () => {
    const { provider, service } = build();
    provider.queue('image-analysis', analysis);
    const result = await service.analyse('biz-1', URL_OK);
    expect(result.analysis).toMatchObject({ productType: 'kurti', quality: 'good', orientation: 'portrait' });
    expect(result.warning).toBeNull();
    const sent = provider.callsFor('image-analysis')[0];
    expect(sent.images).toEqual([{ type: 'url', url: URL_OK }]);
    expect(sent.system).toContain('Never claim details you cannot see');
  });

  it('refuses hosts that are not our trusted storage, before any request', async () => {
    const { provider, service } = build();
    for (const bad of ['https://evil.example.com/a.png', 'https://169.254.169.254/latest/meta-data', 'https://res.cloudinary.com.evil.com/democloud/image/upload/a.png']) {
      await expect(service.analyse('biz-1', bad)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(provider.calls).toHaveLength(0);
  });

  it('refuses plain http, embedded credentials, malformed URLs and another cloud', async () => {
    const { service } = build();
    for (const bad of ['http://res.cloudinary.com/democloud/image/upload/a.png', 'https://user:pw@res.cloudinary.com/democloud/image/upload/a.png', 'not a url', 'https://res.cloudinary.com/othercloud/image/upload/a.png']) {
      await expect(service.validate('biz-1', bad)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('refuses a photo that is not one of this shop\'s uploads, including another shop\'s photo', async () => {
    await expect(build(undefined, null).service.validate('biz-1', URL_OK)).rejects.toThrow('not found in your uploads');
    await expect(build(undefined, { businessId: 'other-biz', mimeType: 'image/png', bytes: 1 }).service.validate('biz-1', URL_OK)).rejects.toThrow('not found in your uploads');
  });

  it('refuses unsupported types and oversized photos', async () => {
    await expect(build(undefined, { businessId: 'biz-1', mimeType: 'image/heic', bytes: 1 }).service.validate('biz-1', URL_OK)).rejects.toThrow('JPEG, PNG or WEBP');
    await expect(build(undefined, { businessId: 'biz-1', mimeType: 'image/png', bytes: 6 * 1024 * 1024 }).service.validate('biz-1', URL_OK)).rejects.toThrow('under 5 MB');
  });

  it('fails clearly when image storage is not configured', async () => {
    await expect(build({}).service.validate('biz-1', URL_OK)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('carries on without the photo, with a warning, when Claude cannot read it', async () => {
    const a = build();
    a.provider.queue('image-analysis', new BadGatewayException('Anthropic could not fetch the image'));
    expect(await a.service.analyse('biz-1', URL_OK)).toEqual({ analysis: null, warning: expect.stringContaining('could not be analysed') });
    const b = build();
    b.provider.queue('image-analysis', new AiOutputInvalidError('bad'));
    expect((await b.service.analyse('biz-1', URL_OK)).analysis).toBeNull();
  });

  it('does not hide configuration problems behind the photo warning', async () => {
    const { provider, service } = build();
    provider.queue('image-analysis', new ServiceUnavailableException('The AI service is not configured correctly'));
    await expect(service.analyse('biz-1', URL_OK)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
