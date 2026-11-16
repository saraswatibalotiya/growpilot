import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { StudioService } from './studio.service';

const WARM = '#8A5A3A'; // the real product colour in these tests
const MILD_DRIFT = '#856040'; // a little greyer: shifts the colour a noticeable amount, but not a lot
const GREY = '#7F7F7F'; // clearly wrong: the product lost its colour

/** A product (coloured block) on a plain light backdrop. */
async function picture(width: number, height: number, product: string, share = 0.6): Promise<Buffer> {
  const block = await sharp({ create: { width: Math.round(width * share), height: Math.round(height * share), channels: 3, background: product } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: '#EDEDED' } })
    .composite([{ input: block, gravity: 'centre' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

function build() {
  const outputs: Buffer[] = [];
  const provider = {
    name: 'gemini',
    external: true,
    dailyLimitPerBusiness: 10,
    modelFor: () => 'gemini-test',
    costFor: () => 0.02,
    edit: jest.fn(async () => ({ buffer: outputs.shift()!, provider: 'gemini', report: {}, costUsd: 0.02 })),
  };
  const usage = {
    findScene: jest.fn(async () => null as string | null),
    reserve: jest.fn(async () => true),
    settle: jest.fn(async () => undefined),
    saveScene: jest.fn(async () => undefined),
  };
  const cloudinary = { upload: jest.fn(async () => ({ secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/scene.jpg', publicId: 'p', width: 1080, height: 1920, bytes: 1 })) };
  const service = new StudioService(new ConfigService({}), {} as never, {} as never, cloudinary as never, {} as never, { external: () => provider } as never, usage as never);
  return { service, provider, usage, cloudinary, outputs };
}

describe('Reel AI scenes: the product colour is protected', () => {
  let original: Buffer;
  let good: Buffer;
  let mild: Buffer;
  let grey: Buffer;
  beforeAll(async () => {
    original = await picture(800, 1000, WARM, 0.5);
    good = await picture(1080, 1920, WARM);
    mild = await picture(1080, 1920, MILD_DRIFT);
    grey = await picture(1080, 1920, GREY);
  });

  it('stores a scene whose product colour is right, after a single Gemini call', async () => {
    const t = build();
    t.outputs.push(good);
    const scene = await t.service.reelScene('biz-1', original, 'enhance');
    expect(scene.length).toBeGreaterThan(1000);
    expect(t.provider.edit).toHaveBeenCalledTimes(1);
    expect(t.cloudinary.upload).toHaveBeenCalledTimes(1);
    expect(t.usage.settle).toHaveBeenCalledWith('biz-1', expect.any(String), 'stored');
  });

  it('asks again, saying what went wrong, when the colour drifts noticeably, and keeps the better second try', async () => {
    const t = build();
    t.outputs.push(mild, good);
    await t.service.reelScene('biz-1', original, 'enhance');
    expect(t.provider.edit).toHaveBeenCalledTimes(2);
    const calls = t.provider.edit.mock.calls as unknown as Array<[{ instructions: string }]>;
    expect(calls[0]![0].instructions).not.toMatch(/previous attempt/i);
    expect(calls[1]![0].instructions).toMatch(/previous attempt changed the product's colour/i);
    expect(t.usage.settle).toHaveBeenCalledWith('biz-1', expect.any(String), 'stored');
  });

  it('accepts a small leftover drift after the retry rather than failing the Reel', async () => {
    const t = build();
    t.outputs.push(mild, mild);
    await expect(t.service.reelScene('biz-1', original, 'enhance')).resolves.toBeInstanceOf(Buffer);
    expect(t.provider.edit).toHaveBeenCalledTimes(2);
  });

  it('refuses a scene that clearly changed the product colour, and stores nothing', async () => {
    const t = build();
    t.outputs.push(grey, grey);
    await expect(t.service.reelScene('biz-1', original, 'enhance')).rejects.toThrow(/changed your product's colour/i);
    expect(t.provider.edit).toHaveBeenCalledTimes(2);
    expect(t.cloudinary.upload).not.toHaveBeenCalled();
    expect(t.usage.saveScene).not.toHaveBeenCalled();
    expect(t.usage.settle).toHaveBeenCalledWith('biz-1', expect.any(String), 'rejected');
  });

  it('gives that refusal as a clear 422 the owner can act on', async () => {
    const t = build();
    t.outputs.push(grey, grey);
    await expect(t.service.reelScene('biz-1', original, 'enhance')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('does not pay for a scene twice: a saved one is reused with no Gemini call', async () => {
    const t = build();
    t.usage.findScene.mockResolvedValueOnce('https://res.cloudinary.com/demo/image/upload/v1/saved.jpg');
    const download = jest.spyOn(t.service, 'download').mockResolvedValue(good);
    const scene = await t.service.reelScene('biz-1', original, 'enhance');
    expect(scene).toBe(good);
    expect(download).toHaveBeenCalled();
    expect(t.provider.edit).not.toHaveBeenCalled();
    expect(t.usage.reserve).not.toHaveBeenCalled();
  });

  it('does not retry (and does not charge a second time) when the first scene is simply broken', async () => {
    const t = build();
    t.outputs.push(await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#EDEDED' } }).jpeg().toBuffer());
    await expect(t.service.reelScene('biz-1', original, 'enhance')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(t.provider.edit).toHaveBeenCalledTimes(1);
  });
});
