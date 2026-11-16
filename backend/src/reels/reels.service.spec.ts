import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MetaApiError } from '../instagram/meta-api.error';
import { PublishingService } from '../publishing/publishing.service';
import { ReelPipelineService } from './reel-pipeline.service';
import { RESTART_FAILURE, RESTART_PUBLISH_FAILURE, ReelsService } from './reels.service';
import type { ReelCreate, ReelPatch, ReelRecord, ReelsRepository } from './reels.repository';
import { sampleScenes, testPhoto } from './reels.test-helpers';
import { ReelUserError } from './reel-user-error';

const IMAGE_URL = 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/a.jpg';
const PRODUCT_IMAGE = 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/product.jpg';

/** In-memory stand-in for ReelsRepository. updateIf checks and writes without awaiting in between, like the SQL it replaces. */
class FakeRepository {
  rows = new Map<string, ReelRecord>();
  history: Array<{ id: string; status: string; stage: string }> = [];
  private n = 0;

  async create(id: string, data: ReelCreate): Promise<ReelRecord> {
    const row = {
      productId: null, mediaAssetId: null, look: 'FULL_PHOTO', backgroundStyle: 'BEIGE_STUDIO', animationLevel: 'BALANCED', textStyle: 'CLASSIC', music: 'NONE', renderReport: null, instruction: null, tone: 'elegant', captionLength: 'medium', hashtagLevel: 'medium', price: null, offerText: null, script: null, scenes: null, caption: null, hashtags: null,
      status: 'QUEUED', stage: 'UNDERSTANDING', error: null, voiceUrl: null, extraImageUrls: null, videoUrl: null, thumbnailUrl: null, durationSeconds: 10, voiceStale: true, videoStale: true,
      publishAmbiguous: false, instagramMediaId: null, permalink: null, publishedAt: null, approvedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data, id,
    } as ReelRecord;
    this.rows.set(id, row);
    return { ...row };
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }
  async list(businessId: string) {
    return [...this.rows.values()].filter((r) => r.businessId === businessId).map((r) => ({ ...r }));
  }
  async updateIf(id: string, from: string | undefined, patch: ReelPatch) {
    const row = this.rows.get(id);
    if (!row || (from && row.status !== from)) return null;
    Object.assign(row, patch, { updatedAt: new Date(Date.now() + ++this.n) });
    this.history.push({ id, status: row.status, stage: row.stage });
    return { ...row };
  }
  async idsInJobStatuses() {
    return [...this.rows.values()].filter((r) => ['QUEUED', 'WRITING_SCRIPT', 'GENERATING_VOICE', 'RENDERING', 'PUBLISHING'].includes(r.status)).map((r) => ({ id: r.id, status: r.status }));
  }
}

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('timed out waiting');
};

async function build(opts: { flag?: string; allowlisted?: boolean; accountMock?: boolean; ai?: boolean } = {}) {
  const image = await testPhoto();
  const repo = new FakeRepository();
  const scripts = {
    write: jest.fn(async () => ({
      script: 'Nayi cotton kurti aayi hai, aaram aur style ek saath, aaj hi dekhiye.',
      scenes: sampleScenes('en'),
      caption: 'Nayi cotton kurti',
      hashtags: ['#a1', '#a2', '#a3', '#a4', '#a5', '#a6', '#a7', '#a8'],
    })),
  };
  const cloudinary = { upload: jest.fn(async (_b: Buffer, mime: string, _f: string, name: string) => ({ secureUrl: `https://res.cloudinary.com/demo/${mime.startsWith('video') ? 'video' : 'image'}/upload/v1/${name}` })) };
  const scene = Buffer.from('ai-scene');
  const studio = {
    download: jest.fn(async (url: string) => image),
    aiEditingAvailable: jest.fn(() => opts.ai ?? false),
    reelScene: jest.fn(async () => scene),
  };
  const pipeline = new ReelPipelineService(repo as unknown as ReelsRepository, scripts as never, cloudinary as never, studio as never);
  const render = jest.fn(async (input: { onStage?: (s: 'SCENES' | 'RENDERING') => Promise<void> }) => {
    await input.onStage?.('SCENES');
    await input.onStage?.('RENDERING');
    return { video: Buffer.from('mp4'), thumbnail: Buffer.from('jpg'), report: { passed: true, checks: [] } };
  });
  pipeline.renderVideo = render as never;

  const config = { get: (k: string) => (k === 'ENABLE_LIVE_INSTAGRAM_PUBLISH' ? (opts.flag ?? 'true') : undefined) };
  const business = { primaryBusinessId: jest.fn(async (userId: string) => (userId === 'u2' ? 'biz-2' : 'biz-1')) };
  const businesses = { findPrimaryForUser: jest.fn(async () => ({ id: 'biz-1', name: 'Shree Fashion' })) };
  const products = {
    findById: jest.fn(async (id: string) => (id === 'prod-1' ? { id, businessId: 'biz-1', name: 'Cotton Kurti', price: '899.00', imageUrl: PRODUCT_IMAGE } : id === 'prod-x' ? { id, businessId: 'biz-2', name: 'Other', price: null, imageUrl: null } : null)),
  };
  const media = {
    findById: jest.fn(async (id: string) => (id === 'asset-1' ? { id, businessId: 'biz-1', secureUrl: IMAGE_URL, variant: 'original', sourceAssetId: null, approvedAt: null } : null)),
    findBySecureUrl: jest.fn(async (url: string) => (url === IMAGE_URL ? { id: 'asset-1', businessId: 'biz-1', secureUrl: url, variant: 'original', sourceAssetId: null } : null)),
  };

  const account = { id: 'acc', platformAccountId: '1784', username: 'shop', isMock: opts.accountMock ?? false, status: 'connected' };
  const instagram = {
    owned: jest.fn(async () => account),
    isAllowlisted: jest.fn(() => opts.allowlisted ?? true),
    withToken: jest.fn(async (_a: unknown, call: (t: string) => Promise<unknown>) => call('token')),
  };
  const graph = {
    mode: 'live',
    createReelContainer: jest.fn(async () => 'container-1'),
    containerStatus: jest.fn(async () => 'FINISHED'),
    publishContainer: jest.fn(async () => 'ig-media-1'),
    getMediaPermalink: jest.fn(async () => 'https://www.instagram.com/reel/abc/'),
    createImageContainer: jest.fn(),
  };
  const publishing = new PublishingService(config as never, {} as never, {} as never, instagram as never, { findByBusiness: jest.fn(async () => ({ id: 'acc' })) } as never, graph as never, {} as never, undefined);
  publishing.pollDelayMs = 0;

  const service = new ReelsService(config as never, business as never, businesses as never, repo as unknown as ReelsRepository, products as never, media as never, pipeline, publishing);
  const make = async (over: Record<string, unknown> = {}) => {
    const reel = await service.generate('u1', { language: 'en', template: 'SHOWCASE', tone: 'elegant', productId: 'prod-1', ...over } as never);
    await pipeline.idle();
    return reel.id;
  };
  return { service, repo, pipeline, scripts, media, cloudinary, render, studio, scene, image, graph, instagram, publishing, make, status: (id: string) => repo.rows.get(id)!.status, row: (id: string) => repo.rows.get(id)! };
}

describe('ReelsService generate', () => {
  it('returns QUEUED at once and then reaches READY with real progress, storing the video URL', async () => {
    const t = await build();
    const created = await t.service.generate('u1', { language: 'en', template: 'SHOWCASE', tone: 'elegant', productId: 'prod-1' } as never);
    expect(created.status).toBe('QUEUED');
    expect(created).toMatchObject({ productName: 'Cotton Kurti', price: '899', businessName: 'Shree Fashion', tone: 'elegant', sourceImageUrl: PRODUCT_IMAGE });
    await t.pipeline.idle();
    const done = t.row(created.id);
    expect(done).toMatchObject({ status: 'READY', stage: 'PREVIEW', voiceStale: false, videoStale: false, error: null });
    expect(done.videoUrl).toContain('reel.mp4');
    expect(done.thumbnailUrl).toContain('thumbnail.jpg');
    const seen = t.repo.history.map((h) => `${h.status}/${h.stage}`);
    expect(seen).toEqual(expect.arrayContaining(['WRITING_SCRIPT/UNDERSTANDING', 'WRITING_SCRIPT/SCRIPT', 'RENDERING/SCENES', 'RENDERING/RENDERING', 'READY/PREVIEW']));
    expect(seen.indexOf('READY/PREVIEW')).toBe(seen.length - 1);
  });

  it('never marks READY without a stored video URL', async () => {
    const t = await build();
    t.cloudinary.upload.mockImplementation(async (_b: Buffer, mime: string) => {
      if (mime === 'video/mp4') throw new ServiceUnavailableException('Image storage is not configured');
      return { secureUrl: 'https://res.cloudinary.com/demo/x' };
    });
    const id = await t.make();
    expect(t.row(id)).toMatchObject({ status: 'FAILED', videoUrl: null, error: 'Image storage is not configured' });
  });

  it('rejects photos and products that are not the business\'s, and a Special Offer with nothing to show', async () => {
    const t = await build();
    await expect(t.service.generate('u1', { language: 'en', template: 'SHOWCASE', productId: 'prod-x' } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.generate('u1', { language: 'en', template: 'SHOWCASE', imageUrl: 'https://res.cloudinary.com/demo/other.jpg', productName: 'X' } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.generate('u1', { language: 'en', template: 'SPECIAL_OFFER', mediaAssetId: 'asset-1', productName: 'X' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.generate('u1', { language: 'en', template: 'SHOWCASE', mediaAssetId: 'asset-1' } as never)).rejects.toBeInstanceOf(BadRequestException);
    const ok = await t.service.generate('u1', { language: 'en', template: 'SPECIAL_OFFER', mediaAssetId: 'asset-1', productName: 'X', offerText: 'Flat  20% off' } as never);
    expect(ok.offerText).toBe('Flat 20% off');
    await t.pipeline.idle();
  });

  it('turns unexpected errors into a safe message and keeps AI errors readable', async () => {
    const t = await build();
    t.render.mockRejectedValueOnce(new Error('Command failed: ffmpeg -i /tmp/secret-path'));
    const id = await t.make();
    expect(t.row(id).error).toBe('The Reel could not be made. Please try again in a minute.');
    t.scripts.write.mockRejectedValueOnce(new ServiceUnavailableException('The AI service is not configured'));
    const id2 = await t.make();
    expect(t.row(id2)).toMatchObject({ status: 'FAILED', stage: 'SCRIPT', error: 'The AI service is not configured' });
  });
});

describe('ReelsService extra photos', () => {
  it('uses up to five photos: the main one plus extras, each from the business', async () => {
    const t = await build();
    t.media.findById.mockImplementation(async (id: string) => (id.startsWith('asset-') ? { id, businessId: 'biz-1', secureUrl: `https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/${id}.jpg`, variant: 'original', sourceAssetId: null, approvedAt: null } : null));
    const id = await t.make({ productId: undefined, mediaAssetId: 'asset-1', productName: 'X', extraMediaAssetIds: ['asset-2', 'asset-3', 'asset-2', 'asset-4'] });
    expect(t.row(id).extraImageUrls).toHaveLength(3);
    expect(t.render).toHaveBeenCalledWith(expect.objectContaining({ extraImages: [t.image, t.image, t.image] }));
    await expect(t.make({ productId: undefined, mediaAssetId: 'asset-1', productName: 'X', extraMediaAssetIds: ['nope'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('works with one photo as before', async () => {
    const t = await build();
    const id = await t.make();
    expect(t.row(id).extraImageUrls ?? null).toBeNull();
    expect(t.render).toHaveBeenCalledWith(expect.objectContaining({ extraImages: [] }));
  });
});

describe('ReelsService cancel', () => {
  it('stops a job between stages and never writes READY after it', async () => {
    const t = await build();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    t.scripts.write.mockImplementation(async () => {
      await gate;
      return { script: 'x', scenes: sampleScenes('en'), caption: 'c', hashtags: [] };
    });
    const created = await t.service.generate('u1', { language: 'en', template: 'SHOWCASE', tone: 'elegant', productId: 'prod-1' } as never);
    await waitFor(() => t.status(created.id) === 'WRITING_SCRIPT');
    const cancelled = await t.service.cancel('u1', created.id);
    expect(cancelled.status).toBe('CANCELLED');
    release();
    await t.pipeline.idle();
    expect(t.status(created.id)).toBe('CANCELLED');
    expect(t.render).not.toHaveBeenCalled();
    expect(t.cloudinary.upload).not.toHaveBeenCalled();
  });

  it('only cancels reels that are being made', async () => {
    const t = await build();
    const id = await t.make();
    await expect(t.service.cancel('u1', id)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ReelsService editing and staleness', () => {
  it('a caption or hashtag edit changes nothing else and renders nothing', async () => {
    const t = await build();
    const id = await t.make();
    t.render.mockClear();
    const edited = await t.service.update('u1', id, { caption: 'New caption', hashtags: ['summer', '#Kurti'] });
    expect(edited).toMatchObject({ caption: 'New caption', hashtags: ['#summer', '#Kurti'], status: 'READY', stale: { script: false, voice: false, video: false } });
    await t.pipeline.idle();
    expect(t.render).not.toHaveBeenCalled();
  });

  it('uses the gentle AI enhance by default when Gemini is available: the photo fills the screen as a scene', async () => {
    const t = await build({ ai: true });
    const id = await t.make();
    expect(t.row(id).look).toBe('AI_ENHANCE');
    expect(t.row(id).backgroundStyle).toBe('WHITE_STUDIO');
    expect(t.studio.reelScene).toHaveBeenCalledWith('biz-1', t.image, 'enhance');
    expect(t.render).toHaveBeenCalledWith(expect.objectContaining({ image: t.scene, plate: true }));
  });

  it('falls back to the free full photo when Gemini is not set up, and never calls the AI', async () => {
    const t = await build();
    const id = await t.make();
    expect(t.row(id).look).toBe('FULL_PHOTO');
    expect(t.row(id).backgroundStyle).toBe('WHITE_STUDIO');
    expect(t.studio.reelScene).not.toHaveBeenCalled();
    expect(t.render).toHaveBeenCalledWith(expect.objectContaining({ image: t.image }));
  });

  it('the full photo look can still be chosen on purpose, even with Gemini available, and costs no AI image', async () => {
    const t = await build({ ai: true });
    const id = await t.make({ look: 'FULL_PHOTO' });
    expect(t.row(id).look).toBe('FULL_PHOTO');
    expect(t.studio.reelScene).not.toHaveBeenCalled();
  });

  it('an AI look renders over the generated scene, and is refused when AI is not set up', async () => {
    const t = await build({ ai: true });
    const id = await t.make({ look: 'AI_FESTIVE' });
    expect(t.studio.reelScene).toHaveBeenCalledWith('biz-1', t.image, 'festive');
    expect(t.render).toHaveBeenCalledWith(expect.objectContaining({ image: t.scene }));
    expect(t.status(id)).toBe('READY');

    const off = await build();
    await expect(off.service.generate('u1', { language: 'en', template: 'SHOWCASE', productId: 'prod-1', look: 'AI_STUDIO' } as never)).rejects.toThrow('AI backgrounds are not set up');
  });

  it('stores the style options, passes them to the renderer and keeps the quality report', async () => {
    const t = await build();
    const id = await t.make({ backgroundStyle: 'LUXURY_DARK', animationLevel: 'DYNAMIC', textStyle: 'BOLD', music: 'CALM', durationSeconds: 15 });
    expect(t.row(id)).toMatchObject({ backgroundStyle: 'LUXURY_DARK', animationLevel: 'DYNAMIC', textStyle: 'BOLD', music: 'CALM', durationSeconds: 15, renderReport: { passed: true } });
    expect(t.render).toHaveBeenCalledWith(expect.objectContaining({ background: 'LUXURY_DARK', animation: 'DYNAMIC', textStyle: 'BOLD', music: 'CALM', duration: 15, plate: false }));
    expect(t.scripts.write).toHaveBeenCalledWith(expect.objectContaining({ duration: 15 }));
  });

  it('a style change re-renders only, a duration change needs a new script', async () => {
    const t = await build();
    const id = await t.make();
    expect((await t.service.update('u1', id, { backgroundStyle: 'WHITE_STUDIO', music: 'UPBEAT' })).stale).toEqual({ script: false, voice: false, video: true });
    const longer = await t.service.update('u1', id, { durationSeconds: 30 });
    expect(longer.stale).toEqual({ script: true, voice: false, video: true });
    t.scripts.write.mockClear();
    await t.service.regenerate('u1', id, { part: 'video' });
    await t.pipeline.idle();
    expect(t.scripts.write).toHaveBeenCalledWith(expect.objectContaining({ duration: 30 }));
    expect(t.render).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 30, background: 'WHITE_STUDIO', music: 'UPBEAT' }));
  });

  it('a look change re-renders only: the text is reused', async () => {
    const t = await build({ ai: true });
    const id = await t.make();
    const edited = await t.service.update('u1', id, { look: 'AI_LUXURY' });
    expect(edited.stale).toEqual({ script: false, voice: false, video: true });
    await t.service.regenerate('u1', id, { part: 'video' });
    await t.pipeline.idle();
    expect(t.studio.reelScene).toHaveBeenCalledWith('biz-1', t.image, 'luxury');
  });

  it('a template change re-renders only: the text is reused', async () => {
    const t = await build();
    const id = await t.make();
    const edited = await t.service.update('u1', id, { template: 'MINIMAL_PREMIUM' });
    expect(edited.stale).toEqual({ script: false, voice: false, video: true });
    t.render.mockClear();
    await t.service.regenerate('u1', id, { part: 'video' });
    await t.pipeline.idle();
    expect(t.scripts.write).toHaveBeenCalledTimes(1);
    expect(t.render).toHaveBeenCalledWith(expect.objectContaining({ template: 'MINIMAL_PREMIUM' }));
    expect(t.status(id)).toBe('READY');
  });

  it('a language change clears the old text and needs a new script', async () => {
    const t = await build();
    const id = await t.make();
    const edited = await t.service.update('u1', id, { language: 'hi' });
    expect(edited).toMatchObject({ script: null, stale: { script: true, voice: false, video: true } });
    t.scripts.write.mockClear();
    await t.service.regenerate('u1', id, { part: 'video' });
    await t.pipeline.idle();
    expect(t.scripts.write).toHaveBeenCalledTimes(1);
    expect(t.status(id)).toBe('READY');
  });

  it('regenerating the script asks for a shorter one when told to and can change the tone', async () => {
    const t = await build();
    const id = await t.make();
    await t.service.regenerate('u1', id, { part: 'script', shorter: true, tone: 'festive' });
    await t.pipeline.idle();
    expect(t.scripts.write).toHaveBeenLastCalledWith(expect.objectContaining({ tone: 'festive', shorterThan: expect.stringContaining('Nayi cotton kurti') }));
  });

  it('refuses edits while publishing or published, and while the reel is still being made', async () => {
    const t = await build();
    const id = await t.make();
    for (const status of ['PUBLISHING', 'PUBLISHED', 'QUEUED', 'RENDERING']) {
      t.row(id).status = status as never;
      await expect(t.service.update('u1', id, { caption: 'x' })).rejects.toBeInstanceOf(ConflictException);
      await expect(t.service.regenerate('u1', id, { part: 'video' })).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('editing an approved reel takes the approval back', async () => {
    const t = await build();
    const id = await t.make();
    await t.service.approve('u1', id);
    const edited = await t.service.update('u1', id, { caption: 'Changed after approval' });
    expect(edited).toMatchObject({ status: 'READY', approvedAt: null });
  });

  it('keeps other owners out with a 404', async () => {
    const t = await build();
    const id = await t.make();
    await expect(t.service.get('u2', id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.status('u2', id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReelsService startup recovery', () => {
  it('moves jobs left running by a restart to FAILED / PUBLISH_FAILED', async () => {
    const t = await build();
    const a = await t.make();
    const b = await t.make();
    t.row(a).status = 'RENDERING';
    t.row(b).status = 'PUBLISHING';
    await t.service.onModuleInit();
    expect(t.row(a)).toMatchObject({ status: 'FAILED', error: RESTART_FAILURE });
    expect(t.row(b)).toMatchObject({ status: 'PUBLISH_FAILED', publishAmbiguous: true, error: RESTART_PUBLISH_FAILURE });
  });
});

describe('ReelsService publishing guards', () => {
  const approved = async (t: Awaited<ReturnType<typeof build>>) => {
    const id = await t.make();
    await t.service.approve('u1', id);
    return id;
  };
  const untouched = (t: Awaited<ReturnType<typeof build>>) => {
    expect(t.graph.createReelContainer).not.toHaveBeenCalled();
    expect(t.graph.publishContainer).not.toHaveBeenCalled();
  };

  it('does nothing while ENABLE_LIVE_INSTAGRAM_PUBLISH is not true', async () => {
    for (const flag of ['false', '', 'TRUE']) {
      const t = await build({ flag });
      const id = await approved(t);
      await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(ForbiddenException);
      untouched(t);
      expect(t.status(id)).toBe('APPROVED');
    }
  });

  it('refuses a reel that is not approved', async () => {
    const t = await build();
    const id = await t.make();
    await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(ConflictException);
    untouched(t);
  });

  it('refuses mock accounts and accounts that are not allowlisted, leaving the reel approved', async () => {
    for (const o of [{ accountMock: true }, { allowlisted: false }]) {
      const t = await build(o);
      const id = await approved(t);
      await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(ForbiddenException);
      untouched(t);
      expect(t.status(id)).toBe('APPROVED');
    }
  });

  it('publishes once, stores the media id and permalink, and a second click gets 409', async () => {
    const t = await build();
    const id = await approved(t);
    const [first, second] = await Promise.allSettled([t.service.publish('u1', id), t.service.publish('u1', id)]);
    expect([first.status, second.status].sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = [first, second].find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(t.graph.publishContainer).toHaveBeenCalledTimes(1);
    expect(t.graph.createReelContainer).toHaveBeenCalledWith('token', '1784', { videoUrl: expect.stringContaining('reel.mp4'), caption: 'Nayi cotton kurti\n\n#a1 #a2 #a3 #a4 #a5 #a6 #a7 #a8' });
    expect(t.row(id)).toMatchObject({ status: 'PUBLISHED', instagramMediaId: 'ig-media-1', permalink: 'https://www.instagram.com/reel/abc/', error: null });
    expect(t.row(id).publishedAt).toBeInstanceOf(Date);
    await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('still publishes when the permalink cannot be read', async () => {
    const t = await build();
    t.graph.getMediaPermalink.mockRejectedValue(new Error('boom'));
    const id = await approved(t);
    await t.service.publish('u1', id);
    expect(t.row(id)).toMatchObject({ status: 'PUBLISHED', permalink: null });
  });

  it('a failure before the final publish call can be retried', async () => {
    const t = await build();
    const id = await approved(t);
    t.graph.createReelContainer.mockRejectedValueOnce(new MetaApiError(400, 100, undefined, 'bad video'));
    await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(HttpException);
    expect(t.row(id)).toMatchObject({ status: 'PUBLISH_FAILED', publishAmbiguous: false });
    expect(t.row(id).error).toContain('Instagram refused the post');
    await t.service.publish('u1', id);
    expect(t.status(id)).toBe('PUBLISHED');
  });

  it('a failure at the final publish call is ambiguous and is never retried automatically', async () => {
    const t = await build();
    const id = await approved(t);
    t.graph.publishContainer.mockRejectedValueOnce(new MetaApiError(504, undefined, undefined, 'timeout'));
    await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(HttpException);
    expect(t.row(id)).toMatchObject({ status: 'PUBLISH_FAILED', publishAmbiguous: true });
    t.graph.createReelContainer.mockClear();
    await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(ConflictException);
    expect(t.graph.createReelContainer).not.toHaveBeenCalled();
    expect(t.graph.publishContainer).toHaveBeenCalledTimes(1);
  });

  it('refuses a video that is out of date', async () => {
    const t = await build();
    const id = await approved(t);
    t.row(id).videoStale = true;
    await expect(t.service.publish('u1', id)).rejects.toBeInstanceOf(ConflictException);
    untouched(t);
  });
});
