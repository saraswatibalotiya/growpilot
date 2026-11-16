import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { buildGeminiPrompt, extractImage, GeminiImageService } from './gemini-image.service';
import { readGeminiConfig } from './gemini.config';

const config = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as unknown as ConfigService;
const photo = () => sharp({ create: { width: 400, height: 500, channels: 3, background: '#ddd' } }).jpeg().toBuffer();
const request = async (extra: Record<string, unknown> = {}) => ({ original: await photo(), metrics: {} as never, category: 'general' as const, format: 'portrait' as const, instructions: null, ...extra });

describe('readGeminiConfig', () => {
  it('is off without a key and uses the configured models', () => {
    expect(GeminiImageService.isConfigured(config({}))).toBe(false);
    const cfg = readGeminiConfig(config({ GEMINI_API_KEY: 'k', GEMINI_IMAGE_MODEL: 'm-lite', GEMINI_IMAGE_PREMIUM_MODEL: 'm-pro', GEMINI_DAILY_LIMIT_PER_BUSINESS: '3' }));
    expect(cfg).toMatchObject({ apiKey: 'k', model: 'm-lite', premiumModel: 'm-pro', dailyLimitPerBusiness: 3 });
    expect(readGeminiConfig(config({})).model).toBe('gemini-3.1-flash-lite-image');
  });
});

describe('buildGeminiPrompt / extractImage', () => {
  it('always includes the product preservation rules', () => {
    const prompt = buildGeminiPrompt('festive', 'make it warm');
    expect(prompt).toContain('must stay EXACTLY the same');
    expect(prompt).toContain('festive');
    expect(prompt).toContain('make it warm');
  });

  it('reads camelCase and snake_case inline images', () => {
    expect(extractImage({ candidates: [{ content: { parts: [{ text: 'x' }, { inlineData: { data: Buffer.from('a').toString('base64') } }] } }] })?.toString()).toBe('a');
    expect(extractImage({ candidates: [{ content: { parts: [{ inline_data: { data: Buffer.from('b').toString('base64') } }] } }] })?.toString()).toBe('b');
    expect(extractImage({})).toBeNull();
  });
});

describe('GeminiImageService.edit', () => {
  const realFetch = global.fetch;
  afterEach(() => (global.fetch = realFetch));

  it('calls the premium model when asked and returns an exact Instagram-size JPEG', async () => {
    const generated = await sharp({ create: { width: 864, height: 1080, channels: 3, background: '#a33' } }).png().toBuffer();
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: generated.toString('base64') } }] } }] }), { status: 200 }));
    global.fetch = fetchMock as never;
    const service = new GeminiImageService(config({ GEMINI_API_KEY: 'secret', GEMINI_IMAGE_PREMIUM_MODEL: 'pro-model' }));

    const result = await service.edit(await request({ style: 'luxury', premium: true }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/models/pro-model:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('secret');
    const body = JSON.parse(init.body);
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } });
    expect(body.contents[0].parts[0].text).toContain('luxury');
    const meta = await sharp(result.buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 1350]);
    expect(result).toMatchObject({ provider: 'gemini', model: 'pro-model', costUsd: 0.04 });
  });

  it('turns API errors and empty answers into a 502', async () => {
    const service = new GeminiImageService(config({ GEMINI_API_KEY: 'k' }));
    global.fetch = jest.fn().mockResolvedValue(new Response('nope', { status: 500 })) as never;
    await expect(service.edit(await request())).rejects.toBeInstanceOf(BadGatewayException);
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })) as never;
    await expect(service.edit(await request())).rejects.toBeInstanceOf(BadGatewayException);
  });
});
