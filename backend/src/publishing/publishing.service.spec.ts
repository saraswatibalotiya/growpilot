import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MetaApiError } from '../instagram/meta-api.error';
import { allowedRatio, instagramCaption, instagramImageUrl, PublishingService } from './publishing.service';

const URL1 = 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/a.png';
const URL2 = 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/b.png';

function build(opts: { size?: { width: number; height: number }; sizes?: Array<{ width: number; height: number }>; longCaption?: boolean; flag?: string; status?: string; photos?: string[]; account?: Record<string, unknown>; allowlisted?: boolean; mode?: string; duplicate?: boolean; poster?: string } = {}) {
  const config = { get: (k: string) => (k === 'ENABLE_LIVE_INSTAGRAM_PUBLISH' ? (opts.flag ?? 'true') : undefined) };
  const photos = opts.photos ?? [URL1];
  const posts = {
    get: jest.fn(async () => ({ id: 'p1', businessId: 'biz-1', status: opts.status ?? 'USER_APPROVED', caption: opts.longCaption ? 'x'.repeat(2300) : 'Nayi kurti aayi hai', hashtags: ['#Kurti', '#Style'], posterImageUrl: opts.poster ?? null, images: photos.map((imageUrl, position) => ({ position, imageUrl })) })),
    moveTo: jest.fn(async () => ({})),
    assertNotPublishedDuplicate: jest.fn(async () => {
      if (opts.duplicate) throw new ConflictException('Duplicate: already published');
    }),
  };
  const postsRepository = { recordPublished: jest.fn(async () => ({})) };
  const account = { id: 'acc', platformAccountId: '1784', username: 'shop', isMock: false, status: 'connected', ...opts.account };
  const instagram = {
    owned: jest.fn(async () => account),
    isAllowlisted: jest.fn(() => opts.allowlisted ?? true),
    withToken: jest.fn(async (_a: unknown, call: (t: string) => Promise<unknown>) => call('token')),
  };
  const instagramRepository = { findByBusiness: jest.fn(async () => ({ id: 'acc' })) };
  let call = 0;
  const media = { findBySecureUrl: jest.fn(async () => ({ ...(opts.sizes ? opts.sizes[call++ % opts.sizes.length] : (opts.size ?? { width: 1000, height: 1000 })) })) };
  let n = 0;
  const graph = {
    mode: opts.mode ?? 'live',
    createImageContainer: jest.fn(async () => `c${++n}`),
    createCarouselContainer: jest.fn(async () => 'carousel'),
    createReelContainer: jest.fn(async () => 'reel-container'),
    containerStatus: jest.fn(async () => 'FINISHED'),
    publishContainer: jest.fn(async () => 'ig-media-1'),
  };
  const cloudinary = { upload: jest.fn(async () => ({ secureUrl: 'https://res.cloudinary.com/demo/video/upload/v1/reel.mp4' })) };
  const service = new PublishingService(config as never, posts as never, postsRepository as never, instagram as never, instagramRepository as never, graph as never, media as never, cloudinary as never);
  service.pollDelayMs = 0;
  service.fetchImage = jest.fn(async () => true);
  service.fetchBytes = jest.fn(async () => Buffer.from('img'));
  service.renderVideo = jest.fn(async () => Buffer.from('mp4'));
  return { service, posts, postsRepository, graph, instagram, cloudinary };
}

const untouched = (graph: ReturnType<typeof build>['graph']) => {
  expect(graph.createImageContainer).not.toHaveBeenCalled();
  expect(graph.publishContainer).not.toHaveBeenCalled();
};

describe('PublishingService gates', () => {
  it('does nothing while ENABLE_LIVE_INSTAGRAM_PUBLISH is not true', async () => {
    for (const flag of ['false', '', 'TRUE', '1']) {
      const { service, graph, posts } = build({ flag });
      await expect(service.publish('u', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      untouched(graph);
      expect(posts.moveTo).not.toHaveBeenCalled();
    }
  });

  it('refuses a post that is not approved', async () => {
    for (const status of ['DRAFT', 'PREVIEW_READY', 'PUBLISHING', 'PUBLISHED', 'FAILED']) {
      const { service, graph } = build({ status });
      await expect(service.publish('u', 'p1')).rejects.toBeInstanceOf(ConflictException);
      untouched(graph);
    }
  });

  it('refuses mock accounts, disconnected accounts, non-live mode and accounts not on the allowlist', async () => {
    for (const o of [{ account: { isMock: true } }, { account: { status: 'expired' } }, { mode: 'mock' }, { allowlisted: false }]) {
      const { service, graph, posts } = build(o);
      await expect(service.publish('u', 'p1')).rejects.toBeDefined();
      untouched(graph);
      expect(posts.moveTo).not.toHaveBeenCalled();
    }
  });

  it('refuses a photo that was already published, and calls Instagram not at all', async () => {
    const { service, graph } = build({ duplicate: true });
    await expect(service.publish('u', 'p1')).rejects.toBeInstanceOf(ConflictException);
    untouched(graph);
  });
});

describe('PublishingService publishing', () => {
  it('sends the approved poster as the cover and keeps every real photo after it', async () => {
    const POSTER = 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/poster.jpg';
    const { service, graph } = build({ poster: POSTER, photos: [URL1, URL2], size: { width: 1080, height: 1350 } });
    await service.publish('u', 'p1');
    const sent = graph.createImageContainer.mock.calls.map((c: unknown[]) => (c[2] as { imageUrl: string }).imageUrl);
    expect(sent).toHaveLength(3);
    expect(sent[0]).toContain('poster.jpg');
    expect(sent[1]).toContain('a.png');
    expect(sent[2]).toContain('b.png');
  });

  it('publishes a Reel made from the poster and photos when asked', async () => {
    const POSTER = 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/poster.jpg';
    const { service, graph, cloudinary } = build({ poster: POSTER, photos: [URL1] });
    await service.publish('u', 'p1', 'reel');
    expect(service.renderVideo).toHaveBeenCalledWith([expect.any(Buffer), expect.any(Buffer)]);
    expect(cloudinary.upload).toHaveBeenCalledWith(expect.any(Buffer), 'video/mp4', 'growpilot/biz-1/reels', 'reel.mp4', 'video');
    expect(graph.createReelContainer).toHaveBeenCalledWith('token', '1784', { videoUrl: 'https://res.cloudinary.com/demo/video/upload/v1/reel.mp4', caption: 'Nayi kurti aayi hai\n\n#Kurti #Style' });
    expect(graph.publishContainer).toHaveBeenCalledWith('token', '1784', 'reel-container');
    expect(graph.createImageContainer).not.toHaveBeenCalled();
  });

  it('posts one photo as a normal post with caption and hashtags, and records the media id', async () => {
    const { service, graph, posts, postsRepository } = build();
    await service.publish('u', 'p1');
    expect(graph.createImageContainer).toHaveBeenCalledWith('token', '1784', { imageUrl: instagramImageUrl(URL1), caption: 'Nayi kurti aayi hai\n\n#Kurti #Style' });
    expect(graph.createCarouselContainer).not.toHaveBeenCalled();
    expect(graph.publishContainer).toHaveBeenCalledWith('token', '1784', 'c1');
    expect(posts.moveTo).toHaveBeenCalledWith('p1', 'PUBLISHING');
    expect(postsRepository.recordPublished).toHaveBeenCalledWith('p1', 'ig-media-1');
  });

  it('posts several photos as a carousel, in order, with the caption on the carousel', async () => {
    const { service, graph } = build({ photos: [URL2, URL1] });
    await service.publish('u', 'p1');
    expect(graph.createImageContainer.mock.calls.map((c: unknown[]) => (c[2] as { imageUrl: string; carouselItem: boolean }).imageUrl)).toEqual([instagramImageUrl(URL2, 1), instagramImageUrl(URL1, 1)]);
    expect(graph.createImageContainer.mock.calls.every((c: unknown[]) => (c[2] as { carouselItem: boolean }).carouselItem === true)).toBe(true);
    expect(graph.createCarouselContainer).toHaveBeenCalledWith('token', '1784', ['c1', 'c2'], 'Nayi kurti aayi hai\n\n#Kurti #Style');
    expect(graph.publishContainer).toHaveBeenCalledWith('token', '1784', 'carousel');
  });

  it('keeps the draft and returns it to PREVIEW_READY when nothing went live', async () => {
    const { service, graph, posts, postsRepository } = build();
    graph.createImageContainer.mockRejectedValueOnce(new MetaApiError(400, 100, undefined, 'bad image'));
    await expect(service.publish('u', 'p1')).rejects.toMatchObject({ message: expect.stringContaining('bad image') });
    expect(posts.moveTo.mock.calls.map((c: unknown[]) => c[1])).toEqual(['PUBLISHING', 'FAILED', 'DRAFT', 'CONTENT_GENERATED', 'PREVIEW_READY']);
    expect(postsRepository.recordPublished).not.toHaveBeenCalled();
  });

  it('leaves the post FAILED, not retryable, when the final publish call fails (it might be live)', async () => {
    const { service, graph, posts } = build();
    graph.publishContainer.mockRejectedValueOnce(new MetaApiError(504, undefined, undefined, 'timeout'));
    await expect(service.publish('u', 'p1')).rejects.toBeDefined();
    expect(posts.moveTo.mock.calls.map((c: unknown[]) => c[1])).toEqual(['PUBLISHING', 'FAILED']);
  });

  it('explains a missing publish permission', async () => {
    const { service, graph } = build();
    graph.createImageContainer.mockRejectedValueOnce(new MetaApiError(403, 10, undefined, 'no permission'));
    await expect(service.publish('u', 'p1')).rejects.toMatchObject({ message: expect.stringContaining('instagram_content_publish') });
  });

  it('warms every prepared photo URL before calling Instagram', async () => {
    const { service } = build({ photos: [URL1, URL2] });
    await service.publish('u', 'p1');
    expect(service.fetchImage).toHaveBeenCalledTimes(2);
  });

  it('stops before Instagram when a photo cannot be prepared, and does not mark the post PUBLISHING', async () => {
    const { service, graph, posts } = build();
    service.fetchImage = jest.fn(async () => false);
    await expect(service.publish('u', 'p1')).rejects.toMatchObject({ message: expect.stringContaining('nothing was posted') });
    untouched(graph);
    expect(posts.moveTo).not.toHaveBeenCalled();
  });
});

describe('Instagram photo rules', () => {
  const sent = (graph: ReturnType<typeof build>['graph']) => graph.createImageContainer.mock.calls.map((c: unknown[]) => (c[2] as { imageUrl: string }).imageUrl);

  it('pads a photo that is too tall (the 36003 case) to 4:5 instead of sending it as is', async () => {
    const { service, graph } = build({ size: { width: 1080, height: 1920 } });
    await service.publish('u', 'p1');
    expect(sent(graph)[0]).toContain('c_pad,ar_0.8000,w_1080,b_auto');
  });

  it('pads a photo that is too wide to 1.91:1', async () => {
    const { service, graph } = build({ size: { width: 3000, height: 1000 } });
    await service.publish('u', 'p1');
    expect(sent(graph)[0]).toContain('ar_1.9000');
  });

  it('leaves a photo that already fits alone, only converting it to JPEG', async () => {
    const { service, graph } = build({ size: { width: 1000, height: 1250 } });
    await service.publish('u', 'p1');
    expect(sent(graph)[0]).toContain('c_limit,w_1440,f_jpg,q_auto');
    expect(sent(graph)[0]).not.toContain('c_pad');
  });

  it('pads every carousel slide to the first slide\'s allowed ratio', async () => {
    const { service, graph } = build({ photos: [URL1, URL2], sizes: [{ width: 1080, height: 1920 }, { width: 1000, height: 1000 }] });
    await service.publish('u', 'p1');
    expect(sent(graph).every((u: string) => u.includes('ar_0.8000'))).toBe(true);
  });

  it('refuses a photo under 320 px wide, a caption over 2,200 characters, before anything is sent', async () => {
    const small = build({ size: { width: 200, height: 200 } });
    await expect(small.service.publish('u', 'p1')).rejects.toBeInstanceOf(ConflictException);
    const long = build({ longCaption: true });
    await expect(long.service.publish('u', 'p1')).rejects.toMatchObject({ message: expect.stringContaining('too long') });
    for (const b of [small, long]) {
      untouched(b.graph);
      expect(b.posts.moveTo).not.toHaveBeenCalled();
    }
  });

  it('allowedRatio clamps to 4:5 .. 1.9:1', () => {
    expect(allowedRatio(1080, 1920)).toBe(0.8);
    expect(allowedRatio(4000, 1000)).toBeCloseTo(1.9, 5);
    expect(allowedRatio(1000, 1000)).toBe(1);
  });
});

describe('helpers', () => {
  it('asks Cloudinary for a JPEG, which is all Instagram accepts', () => {
    expect(instagramImageUrl(URL1)).toBe('https://res.cloudinary.com/demo/image/upload/c_limit,w_1440,f_jpg,q_auto/v1/growpilot/biz-1/a.png');
  });
  it('puts hashtags after the caption', () => {
    expect(instagramCaption({ caption: ' Hi ', hashtags: ['#a'] })).toBe('Hi\n\n#a');
    expect(instagramCaption({ caption: 'Hi', hashtags: null })).toBe('Hi');
  });
});
