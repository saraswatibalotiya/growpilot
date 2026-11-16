import { BadGatewayException, ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramGraphClient } from '../instagram/instagram-graph.client';
import { InstagramRepository } from '../instagram/instagram.repository';
import { InstagramService, type OwnedAccount } from '../instagram/instagram.service';
import { MetaApiError } from '../instagram/meta-api.error';
import { MediaRepository } from '../media/media.repository';
import { CloudinaryClient } from '../media/cloudinary.client';
import { PostsRepository } from '../posts/posts.repository';
import { PostsService } from '../posts/posts.service';
import { renderReel } from './reel-renderer';

interface PostView {
  status: string;
  businessId: string;
  caption: string | null;
  hashtags: string[] | null;
  posterImageUrl?: string | null;
  images: Array<{ imageUrl: string }>;
}

/**
 * What Instagram accepts for feed photos (Content Publishing API):
 *  - JPEG only, at most 8 MB, width 320 to 1440 px,
 *  - aspect ratio between 4:5 (0.8, tallest) and 1.91:1 (widest). Outside that it refuses with error 36003,
 *  - a carousel has 2 to 10 slides, and every slide is cropped to the FIRST slide's ratio,
 *  - caption up to 2,200 characters and at most 30 hashtags.
 */
const IG = { minRatio: 0.8, maxRatio: 1.91, minWidth: 320, maxWidth: 1440, maxCaption: 2200, maxHashtags: 30, maxCarousel: 10 } as const;

/** The nearest ratio Instagram accepts. The wide end stops at 1.9, not 1.91: pixel rounding can push 1.91 just over the limit. */
export function allowedRatio(width: number, height: number): number {
  return Math.min(IG.maxRatio - 0.01, Math.max(IG.minRatio, width / height));
}

/**
 * The URL Instagram should download. Cloudinary does the conversion on the way out, so uploads stay untouched:
 *  - always JPEG with automatic quality, never wider than 1440 px;
 *  - `padTo` set: the whole photo is kept and padded (not cropped) to that ratio, so nothing of the product is cut off.
 */
export function instagramImageUrl(url: string, padTo?: number): string {
  if (!url.includes('/upload/')) return url;
  const resize = padTo ? `c_pad,ar_${padTo.toFixed(4)},w_1080,b_auto` : `c_limit,w_${IG.maxWidth}`;
  return url.replace('/upload/', `/upload/${resize},f_jpg,q_auto/`);
}

/** Caption as it will appear on Instagram: the text, then the hashtags. */
export function instagramCaption(post: { caption: string | null; hashtags: string[] | null }): string {
  return [post.caption?.trim(), (post.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');
}

/**
 * The only place that can post to Instagram. Every condition in AGENTS.md must hold before any live call:
 *  1. the owner explicitly confirmed (the DTO requires confirm=true),
 *  2. ENABLE_LIVE_INSTAGRAM_PUBLISH=true on the server,
 *  3. the post is USER_APPROVED (approval was recorded earlier, by its own request),
 *  4. the account is a real (not mock) connected account that is server-verified as allowlisted,
 *  5. none of the photos was already published (content hash).
 * On failure the draft is kept. Nothing here can be reached by the AI module.
 */
@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);
  /** Poll settings for Instagram's media processing. Overridable in tests. */
  pollAttempts = 15;
  pollDelayMs = 2000;
  /** Video processing is slower than photos. */
  reelPollAttempts = 60;

  constructor(
    private readonly config: ConfigService,
    private readonly posts: PostsService,
    private readonly postsRepository: PostsRepository,
    private readonly instagram: InstagramService,
    private readonly instagramRepository: InstagramRepository,
    private readonly graph: InstagramGraphClient,
    private readonly media: MediaRepository,
    private readonly cloudinary?: CloudinaryClient,
  ) {}

  /** Overridable in tests. */
  renderVideo = renderReel;
  fetchBytes = async (url: string): Promise<Buffer> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`download failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  };

  /** Turns the slides into a vertical MP4 slideshow, stores it, and returns its public URL. */
  private async buildReel(businessId: string, slides: string[]): Promise<string> {
    try {
      const images: Buffer[] = [];
      for (const url of slides) images.push(await this.fetchBytes(url));
      const video = await this.renderVideo(images);
      if (!this.cloudinary) throw new Error('video storage is not available');
      return (await this.cloudinary.upload(video, 'video/mp4', `growpilot/${businessId}/reels`, 'reel.mp4', 'video')).secureUrl;
    } catch (error) {
      this.logger.warn({ event: 'reel_build_failed', message: (error as Error).message });
      throw new BadGatewayException('The Reel could not be made, so nothing was posted. Try again in a minute, or post it as a normal post.');
    }
  }

  /** The slides a Reel is made from: the approved poster first, then the real photos. */
  private slidesOf(post: PostView): string[] {
    const photos = post.images.map((i) => i.imageUrl);
    return (post.posterImageUrl ? [post.posterImageUrl, ...photos] : photos).slice(0, IG.maxCarousel);
  }

  async publish(userId: string, postId: string, format: 'post' | 'reel' = 'post') {
    if (this.config.get<string>('ENABLE_LIVE_INSTAGRAM_PUBLISH') !== 'true') {
      throw new ForbiddenException('Publishing to Instagram is switched off on the server, so nothing was posted.');
    }
    const post = (await this.posts.get(userId, postId)) as unknown as PostView;
    if (post.status !== 'USER_APPROVED') {
      throw new ConflictException(`Only an approved post can be published; this post is ${post.status}`);
    }
    if (!post.caption?.trim()) throw new ConflictException('This post has no caption yet');
    const photos = post.images.map((i) => i.imageUrl);
    if (photos.length === 0) throw new ConflictException('This post has no photo');

    const account = await this.verifiedAccount(userId, post.businessId);
    await this.posts.assertNotPublishedDuplicate(post.businessId, photos);
    const caption = instagramCaption(post);
    this.assertMeetsInstagramLimits(post.hashtags ?? [], caption);
    // The approved poster is the cover; the real photos follow, so the owner's own photo is slide 2.
    const slides = this.slidesOf(post);
    let urls: string[] = [];
    let videoUrl: string | null = null;
    if (format === 'reel') {
      videoUrl = await this.buildReel(post.businessId, slides);
    } else {
      urls = await this.preparePhotos(slides);
      await this.warmPhotos(urls);
    }

    // The attempt is recorded first; a second click finds the post already PUBLISHING and gets a 409.
    await this.posts.moveTo(postId, 'PUBLISHING');
    let wentLive = false;
    try {
      const mediaId = await this.instagram.withToken(account, async (token) => {
        try {
          const id = await this.send(token, account.platformAccountId, urls, caption, () => {
            wentLive = true;
          }, videoUrl);
          return id;
        } catch (error) {
          throw error instanceof MetaApiError ? this.explain(error) : error;
        }
      });
      await this.postsRepository.recordPublished(postId, mediaId);
      this.logger.log({ event: 'instagram_published', postId, photos: photos.length, usedPoster: !!post.posterImageUrl, format, coverUrl: videoUrl ?? urls[0] });
    } catch (error) {
      await this.failSafely(postId, wentLive);
      throw error;
    }
    return this.posts.get(userId, postId);
  }

  /** Caption and hashtag limits, checked before anything is sent so the owner gets a clear message. */
  assertMeetsInstagramLimits(hashtags: string[], caption: string) {
    if (caption.length > IG.maxCaption) throw new ConflictException(`The caption is too long for Instagram (${caption.length} characters, the limit is ${IG.maxCaption}). Shorten it and try again.`);
    if (hashtags.length > IG.maxHashtags) throw new ConflictException(`Instagram allows at most ${IG.maxHashtags} hashtags; this post has ${hashtags.length}.`);
  }

  /**
   * Turns each stored photo into a URL that meets Instagram's rules.
   * A single photo is only padded when its shape is outside 4:5 to 1.91:1. In a carousel every slide is padded to
   * the first slide's (allowed) ratio, because Instagram would otherwise crop the others to it.
   */
  private async preparePhotos(photos: string[]): Promise<string[]> {
    const sizes: Array<{ width: number; height: number } | null> = [];
    for (const url of photos) {
      const asset = await this.media.findBySecureUrl(url);
      const ok = asset?.width && asset?.height;
      if (ok && asset.width! < IG.minWidth) {
        throw new ConflictException(`A photo is too small for Instagram (${asset.width}px wide; the minimum is ${IG.minWidth}px). Use a larger photo.`);
      }
      sizes.push(ok ? { width: asset.width!, height: asset.height! } : null);
    }
    const first = sizes[0];
    if (photos.length > 1) {
      const target = first ? allowedRatio(first.width, first.height) : 1; // unknown size: a square is always accepted
      return photos.map((url) => instagramImageUrl(url, target));
    }
    if (!first) return [instagramImageUrl(photos[0]!, 1)];
    const ratio = first.width / first.height;
    return [instagramImageUrl(photos[0]!, ratio < IG.minRatio || ratio > IG.maxRatio ? allowedRatio(first.width, first.height) : undefined)];
  }

  /**
   * Requests each prepared URL once, so Cloudinary generates the transformed JPEG before Meta downloads it.
   * Otherwise Meta's container call waits on the first-time transformation and can time out.
   */
  private async warmPhotos(urls: string[]): Promise<void> {
    for (const url of urls) {
      let ok = false;
      try {
        ok = await this.fetchImage(url);
      } catch {
        ok = false;
      }
      if (!ok) {
        throw new BadGatewayException('A photo could not be prepared for Instagram, so nothing was posted. Try again in a minute.');
      }
    }
  }

  /** Overridable in tests. */
  fetchImage = async (url: string): Promise<boolean> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    await response.arrayBuffer();
    return response.ok && (response.headers.get('content-type') ?? '').startsWith('image/');
  };

  async verifiedAccount(userId: string, businessId: string): Promise<OwnedAccount> {
    const found = await this.instagramRepository.findByBusiness(businessId);
    if (!found) throw new ConflictException('Connect an Instagram account first');
    const account = await this.instagram.owned(userId, found.id);
    if (account.isMock || this.graph.mode !== 'live') throw new ForbiddenException('Only a real, live Instagram connection can publish');
    if (account.status !== 'connected') throw new ConflictException('The Instagram connection needs to be reconnected');
    if (!this.instagram.isAllowlisted(account)) throw new ForbiddenException('This Instagram account is not on the live-publishing allowlist');
    return account;
  }

  /** Reels made by ReelsService go out through here, so they share the Graph calls, polling and error mapping. `onPublishStart` fires right before the irreversible call. */
  async publishReelVideo(account: OwnedAccount, videoUrl: string, caption: string, onPublishStart: () => void): Promise<{ mediaId: string; permalink: string | null }> {
    return this.instagram.withToken(account, async (token) => {
      let mediaId: string;
      try {
        mediaId = await this.send(token, account.platformAccountId, [], caption, onPublishStart, videoUrl);
      } catch (error) {
        throw error instanceof MetaApiError ? this.explain(error) : error;
      }
      let permalink: string | null = null;
      try {
        permalink = await this.graph.getMediaPermalink(token, mediaId);
      } catch (error) {
        this.logger.warn({ event: 'reel_permalink_failed', mediaId, message: (error as Error).message });
      }
      return { mediaId, permalink };
    });
  }

  /** One photo is a normal post. Two to ten become a carousel. A video URL makes a Reel. Returns the Instagram media id. */
  private async send(token: string, igId: string, urls: string[], caption: string, onPublishStart: () => void, videoUrl: string | null = null): Promise<string> {
    let creation: string;
    if (videoUrl) {
      creation = await this.graph.createReelContainer(token, igId, { videoUrl, caption });
      await this.waitUntilReady(token, creation, this.reelPollAttempts);
      onPublishStart();
      return this.graph.publishContainer(token, igId, creation);
    }
    if (urls.length === 1) {
      creation = await this.graph.createImageContainer(token, igId, { imageUrl: urls[0]!, caption });
    } else {
      const children: string[] = [];
      for (const imageUrl of urls) children.push(await this.graph.createImageContainer(token, igId, { imageUrl, carouselItem: true }));
      for (const child of children) await this.waitUntilReady(token, child);
      creation = await this.graph.createCarouselContainer(token, igId, children, caption);
    }
    await this.waitUntilReady(token, creation);
    onPublishStart(); // from here on a failure is ambiguous: the post may already be live
    return this.graph.publishContainer(token, igId, creation);
  }

  private async waitUntilReady(token: string, containerId: string, attempts = this.pollAttempts): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const status = await this.graph.containerStatus(token, containerId);
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new BadGatewayException(`Instagram could not process the ${attempts > this.pollAttempts ? 'video' : 'photo'} (${status.toLowerCase()})`);
      await new Promise((resolve) => setTimeout(resolve, this.pollDelayMs));
    }
    throw new BadGatewayException('Instagram is still processing it. Nothing was posted; try again in a minute.');
  }

  private explain(error: MetaApiError): Error {
    if (error.isAuthError) return new ConflictException('Instagram connection expired; reconnect the account');
    if (error.isRateLimit) return new BadGatewayException('Instagram rate limit reached; try again later');
    if (error.isPermissionError) {
      return new ForbiddenException('Instagram refused: this connection is missing the instagram_content_publish permission');
    }
    return new BadGatewayException(`Instagram refused the post: ${error.message}`);
  }

  /**
   * The draft is always kept. If nothing went live, the post goes back to PREVIEW_READY so the owner can approve again.
   * If the failure happened at or after the final publish call, the post is left FAILED: it might be live, and an
   * automatic retry could post it twice.
   */
  private async failSafely(postId: string, wentLive: boolean): Promise<void> {
    try {
      await this.posts.moveTo(postId, 'FAILED');
      if (!wentLive) {
        await this.posts.moveTo(postId, 'DRAFT');
        await this.posts.moveTo(postId, 'CONTENT_GENERATED');
        await this.posts.moveTo(postId, 'PREVIEW_READY');
      }
    } catch (error) {
      this.logger.error({ event: 'publish_state_recovery_failed', postId, message: (error as Error).message });
    }
  }
}
