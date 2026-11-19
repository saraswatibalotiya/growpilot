import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cleanPrice } from '../ai/facts';
import { DEFAULT_CAPTION_LENGTH, DEFAULT_HASHTAG_LEVEL } from '../common/constants';
import { BusinessRepository } from '../business/business.repository';
import { BusinessService } from '../business/business.service';
import { pageArgs, toPage, type Page, type PaginationQueryDto } from '../common/pagination';
import { MediaRepository } from '../media/media.repository';
import { normaliseHashtags } from '../posts/posts.service';
import { ProductsRepository } from '../products/products.repository';
import { instagramCaption, PublishingService } from '../publishing/publishing.service';
import { ReelPipelineService } from './reel-pipeline.service';
import { DEFAULT_BACKGROUND, EDITABLE_STATUSES, JOB_STATUSES, REEL_SECONDS, REGENERATABLE_STATUSES } from './reels.constants';
import type { CreateReelDto, RegenerateReelDto, UpdateReelDto } from './reels.dto';
import { ReelsRepository, type ReelPatch, type ReelRecord } from './reels.repository';

const clean = (value: string | undefined | null): string | null => (value ? value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim() || null : null);

export const RESTART_FAILURE = 'The server restarted while this Reel was being made. Please try again.';
export const RESTART_PUBLISH_FAILURE = 'The server restarted while publishing. The Reel may already be live: check your Instagram before trying again.';
const AMBIGUOUS_PUBLISH = 'Publishing may have partly succeeded. Check your Instagram account before trying again; this Reel will not be posted again automatically.';

@Injectable()
export class ReelsService implements OnModuleInit {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly business: BusinessService,
    private readonly businesses: BusinessRepository,
    private readonly repository: ReelsRepository,
    private readonly products: ProductsRepository,
    private readonly media: MediaRepository,
    private readonly pipeline: ReelPipelineService,
    private readonly publishing: PublishingService,
  ) {}

  private resolveLook(look: CreateReelDto['look']) {
    return this.pipeline.aiLooksAvailable() ? look ?? 'AI_ENHANCE' : 'FULL_PHOTO';
  }

  /** A job that was running when the server stopped will never finish: say so instead of leaving it spinning. */
  async onModuleInit() {
    try {
      for (const { id, status } of await this.repository.idsInJobStatuses()) {
        if (status === 'PUBLISHING') await this.repository.updateIf(id, 'PUBLISHING', { status: 'PUBLISH_FAILED', publishAmbiguous: true, error: RESTART_PUBLISH_FAILURE });
        else await this.repository.updateIf(id, status, { status: 'FAILED', error: RESTART_FAILURE });
        this.logger.warn({ event: 'reel_recovered_after_restart', reelId: id, was: status });
      }
    } catch (error) {
      this.logger.error({ event: 'reel_recovery_failed', message: (error as Error).message });
    }
  }

  view(reel: ReelRecord) {
    // There is no voiceover any more, so only the video can be out of date.
    const { voiceStale: _voiceStale, videoStale, ...rest } = reel;
    return { ...rest, scenes: reel.scenes ?? [], hashtags: reel.hashtags ?? [], stale: { script: reel.script === null, voice: false, video: videoStale } };
  }

  private async owned(userId: string, id: string): Promise<ReelRecord> {
    const businessId = await this.business.primaryBusinessId(userId);
    const reel = await this.repository.findById(id);
    if (!reel || reel.businessId !== businessId) throw new NotFoundException('Reel not found');
    return reel;
  }

  /** The photo and product facts a new reel starts from. Everything must belong to the caller's business. */
  private async source(businessId: string, dto: CreateReelDto) {
    let product: { name: string; price: string | null; imageUrl: string | null } | null = null;
    if (dto.productId) {
      const found = (await this.products.findById(dto.productId)) as { businessId: string; name: string; price: string | null; imageUrl: string | null } | null;
      if (!found || found.businessId !== businessId) throw new NotFoundException('Product not found');
      product = found;
    }
    let url: string | null = null;
    let mediaAssetId: string | null = null;
    if (dto.mediaAssetId) {
      const asset = await this.media.findById(dto.mediaAssetId);
      if (!asset || asset.businessId !== businessId) throw new NotFoundException('Media not found');
      url = asset.secureUrl;
      mediaAssetId = asset.id;
    } else if (dto.imageUrl) {
      const asset = await this.media.findBySecureUrl(dto.imageUrl);
      if (asset && asset.businessId === businessId) {
        url = asset.secureUrl;
        mediaAssetId = asset.id;
      } else if (product?.imageUrl && product.imageUrl === dto.imageUrl) {
        url = dto.imageUrl;
      } else {
        throw new NotFoundException('Media not found');
      }
    } else if (product?.imageUrl) {
      url = product.imageUrl;
      mediaAssetId = (await this.media.findBySecureUrl(url))?.id ?? null;
    }
    if (!url) throw new BadRequestException(product ? 'This product has no photo. Send mediaAssetId or imageUrl.' : 'Send productId, mediaAssetId or imageUrl for the photo to use');
    const asset = mediaAssetId ? await this.media.findById(mediaAssetId) : null;
    if (asset?.variant === 'poster') throw new BadRequestException('Choose a product photo, not a finished poster');
    if (asset?.sourceAssetId && !asset.approvedAt) throw new BadRequestException('Approve the edited photo in Photo Studio before using it');
    return { product, url, mediaAssetId };
  }

  /** The extra photos must be the caller's own uploads (not posters or unapproved edits), and are used once each. */
  private async extraPhotos(businessId: string, ids: string[] | undefined, mainUrl: string): Promise<string[] | null> {
    if (!ids?.length) return null;
    const urls: string[] = [];
    for (const id of new Set(ids)) {
      const asset = await this.media.findById(id);
      if (!asset || asset.businessId !== businessId) throw new NotFoundException('Media not found');
      if (asset.variant === 'poster') throw new BadRequestException('Choose product photos, not a finished poster');
      if (asset.sourceAssetId && !asset.approvedAt) throw new BadRequestException('Approve the edited photo in Photo Studio before using it');
      if (asset.secureUrl !== mainUrl && !urls.includes(asset.secureUrl)) urls.push(asset.secureUrl);
    }
    return urls.length ? urls : null;
  }

  async generate(userId: string, dto: CreateReelDto) {
    const business = await this.businesses.findPrimaryForUser(userId);
    if (!business) throw new NotFoundException('Business not found');
    const { product, url, mediaAssetId } = await this.source(business.id, dto);

    const productName = clean(dto.productName) ?? product?.name ?? null;
    if (!productName) throw new BadRequestException('Send productName, or a productId');
    let price: string | null = null;
    if (dto.price !== undefined && dto.price !== '') {
      price = cleanPrice(dto.price);
      if (!price) throw new BadRequestException('That price could not be read. Use digits, for example 899.');
    } else if (product?.price) {
      price = cleanPrice(String(product.price));
    }
    const offerText = clean(dto.offerText);
    if (dto.template === 'SPECIAL_OFFER' && !offerText && !price) throw new BadRequestException('The Special Offer template needs an offer or a price. Type the offer you want shown.');
    const extraImageUrls = await this.extraPhotos(business.id, dto.extraMediaAssetIds, url);

    const reel = await this.repository.create(randomUUID(), {
      businessId: business.id,
      productId: dto.productId ?? null,
      mediaAssetId,
      sourceImageUrl: url,
      extraImageUrls,
      language: dto.language,
      template: dto.template,
      // Gemini's gentle "enhance" is the default when it is available; without it the free full-photo look is used.
      look: this.resolveLook(dto.look),
      backgroundStyle: dto.backgroundStyle ?? DEFAULT_BACKGROUND,
      animationLevel: dto.animationLevel ?? 'BALANCED',
      textStyle: dto.textStyle ?? 'CLASSIC',
      music: dto.music ?? 'NONE',
      durationSeconds: dto.durationSeconds ?? REEL_SECONDS,
      instruction: clean(dto.instruction),
      tone: dto.tone,
      captionLength: dto.captionLength ?? DEFAULT_CAPTION_LENGTH,
      hashtagLevel: dto.hashtagLevel ?? DEFAULT_HASHTAG_LEVEL,
      productName,
      price,
      businessName: business.name,
      offerText,
    });
    this.pipeline.start(reel.id);
    return this.view(reel);
  }

  async list(userId: string, query: PaginationQueryDto): Promise<Page<ReturnType<ReelsService['view']>>> {
    const businessId = await this.business.primaryBusinessId(userId);
    const { take, offset } = pageArgs(query);
    const rows = await this.repository.list(businessId, take, offset);
    return toPage(rows.map((r) => this.view(r)), query);
  }

  async get(userId: string, id: string) {
    return this.view(await this.owned(userId, id));
  }

  /** Small and cheap: this is what the UI polls. */
  async status(userId: string, id: string) {
    const r = await this.owned(userId, id);
    return { id: r.id, status: r.status, stage: r.stage, error: r.error, videoUrl: r.videoUrl, thumbnailUrl: r.thumbnailUrl, updatedAt: r.updatedAt };
  }

  /**
   * Saves the owner's edits and says what is now out of date. Nothing is rendered here: caption and hashtags never
   * need it, and the rest is re-made when the owner asks (POST /reels/:id/regenerate).
   */
  async update(userId: string, id: string, dto: UpdateReelDto) {
    const reel = await this.owned(userId, id);
    if (!EDITABLE_STATUSES.includes(reel.status)) {
      throw new ConflictException(reel.status === 'PUBLISHING' || reel.status === 'PUBLISHED' ? `A reel that is ${reel.status} can't be edited` : `A reel in ${reel.status} can't be edited yet`);
    }
    const patch: ReelPatch = {};
    let videoStale = reel.videoStale;

    if (dto.script !== undefined && dto.script !== reel.script) {
      if (!dto.script) throw new BadRequestException('The script cannot be empty');
      patch.script = dto.script;
      videoStale = true;
    }
    if (dto.language !== undefined && dto.language !== reel.language) {
      // The old text is in the wrong language: a new script is needed, so the old one is cleared.
      patch.language = dto.language;
      patch.script = null;
      patch.scenes = null;
      patch.caption = null;
      patch.hashtags = null;
      videoStale = true;
    }
    if (dto.template !== undefined && dto.template !== reel.template) {
      patch.template = dto.template;
      videoStale = true;
    }
    if (dto.look !== undefined && dto.look !== reel.look) {
      const look = this.resolveLook(dto.look);
      if (look !== reel.look) {
        patch.look = look;
        videoStale = true;
      }
    }
    for (const key of ['backgroundStyle', 'animationLevel', 'textStyle', 'music'] as const) {
      if (dto[key] !== undefined && dto[key] !== reel[key]) {
        (patch as Record<string, unknown>)[key] = dto[key];
        videoStale = true;
      }
    }
    if (dto.durationSeconds !== undefined && dto.durationSeconds !== reel.durationSeconds) {
      // A different length needs a script of a different length, so the old text is cleared like a language change.
      patch.durationSeconds = dto.durationSeconds;
      patch.script = null;
      patch.scenes = null;
      videoStale = true;
    }
    if (dto.tone !== undefined && dto.tone !== reel.tone) patch.tone = dto.tone;
    if (dto.captionLength !== undefined && dto.captionLength !== reel.captionLength) patch.captionLength = dto.captionLength;
    if (dto.hashtagLevel !== undefined && dto.hashtagLevel !== reel.hashtagLevel) patch.hashtagLevel = dto.hashtagLevel;
    if (dto.instruction !== undefined && clean(dto.instruction) !== reel.instruction) patch.instruction = clean(dto.instruction);
    if (dto.productName !== undefined && clean(dto.productName) && clean(dto.productName) !== reel.productName) {
      patch.productName = clean(dto.productName)!;
      videoStale = true;
    }
    if (dto.price !== undefined) {
      const price = dto.price === '' ? null : cleanPrice(dto.price);
      if (dto.price !== '' && !price) throw new BadRequestException('That price could not be read. Use digits, for example 899.');
      if (price !== reel.price) {
        patch.price = price;
        videoStale = true;
      }
    }
    if (dto.offerText !== undefined && clean(dto.offerText) !== reel.offerText) {
      patch.offerText = clean(dto.offerText);
      videoStale = true;
    }
    if (dto.caption !== undefined && dto.caption !== reel.caption) {
      if (!dto.caption) throw new BadRequestException('The caption cannot be empty');
      patch.caption = dto.caption;
    }
    if (dto.hashtags !== undefined) patch.hashtags = normaliseHashtags(dto.hashtags);

    const template = patch.template ?? reel.template;
    if (template === 'SPECIAL_OFFER' && !(patch.offerText !== undefined ? patch.offerText : reel.offerText) && !(patch.price !== undefined ? patch.price : reel.price)) {
      throw new BadRequestException('The Special Offer template needs an offer or a price.');
    }
    if (Object.keys(patch).length === 0) return { ...this.view(reel), changed: [] as string[] };

    patch.videoStale = videoStale;
    if (reel.status === 'APPROVED') {
      patch.status = 'READY';
      patch.approvedAt = null;
    }
    const updated = await this.repository.updateIf(id, reel.status, patch);
    if (!updated) throw new ConflictException('This reel changed while you were editing. Reload it and try again.');
    return { ...this.view(updated), changed: Object.keys(patch).filter((k) => !['videoStale', 'status', 'approvedAt'].includes(k)) };
  }

  async regenerate(userId: string, id: string, dto: RegenerateReelDto) {
    const reel = await this.owned(userId, id);
    if (!REGENERATABLE_STATUSES.includes(reel.status)) throw new ConflictException(`A reel in ${reel.status} can't be regenerated`);
    if (this.pipeline.isRunning(id)) throw new ConflictException('This reel is still stopping. Try again in a moment.');
    const rewriteScript = dto.part === 'script' || dto.part === 'all';
    const patch: ReelPatch = { status: 'QUEUED', stage: 'UNDERSTANDING', error: null, approvedAt: null };
    patch.videoStale = true;
    if (rewriteScript && dto.tone) patch.tone = dto.tone;
    if (rewriteScript && dto.captionLength) patch.captionLength = dto.captionLength;
    if (rewriteScript && dto.hashtagLevel) patch.hashtagLevel = dto.hashtagLevel;
    const queued = await this.repository.updateIf(id, reel.status, patch);
    if (!queued) throw new ConflictException('This reel changed. Reload it and try again.');
    this.pipeline.start(id, { rewriteScript, shorter: rewriteScript && dto.shorter === true });
    return this.view(queued);
  }

  async cancel(userId: string, id: string) {
    const reel = await this.owned(userId, id);
    if (!JOB_STATUSES.includes(reel.status)) throw new ConflictException(`Only a reel that is being made can be cancelled; this reel is ${reel.status}`);
    const cancelled = await this.repository.updateIf(id, reel.status, { status: 'CANCELLED', error: null });
    if (!cancelled) throw new ConflictException('This reel just moved on and could not be cancelled. Reload it.');
    return this.view(cancelled);
  }

  /** The owner's explicit approval. It is stored on its own, before any publish request can use it. */
  async approve(userId: string, id: string) {
    const reel = await this.owned(userId, id);
    if (reel.status !== 'READY') throw new ConflictException(`Only a ready reel can be approved; this reel is ${reel.status}`);
    if (!reel.videoUrl || reel.videoStale) throw new ConflictException('The video is out of date. Regenerate it before approving.');
    if (!reel.caption?.trim()) throw new ConflictException('This reel has no caption yet');
    const approved = await this.repository.updateIf(id, 'READY', { status: 'APPROVED', approvedAt: new Date() });
    if (!approved) throw new ConflictException('This reel changed. Reload it and try again.');
    return this.view(approved);
  }

  /**
   * Mirrors PublishingService.publish: switch, approval, verified allowlisted live account, then an atomic move to
   * PUBLISHING (a second click gets 409). A failure at or after the final publish call is never retried automatically.
   */
  async publish(userId: string, id: string) {
    if (this.config.get<string>('ENABLE_LIVE_INSTAGRAM_PUBLISH') !== 'true') {
      throw new ForbiddenException('Publishing to Instagram is switched off on the server, so nothing was posted.');
    }
    const reel = await this.owned(userId, id);
    if (reel.status === 'PUBLISH_FAILED' && reel.publishAmbiguous) {
      throw new ConflictException('A previous attempt may already be live. Check your Instagram; this Reel is not posted again automatically.');
    }
    if (reel.status !== 'APPROVED' && reel.status !== 'PUBLISH_FAILED') throw new ConflictException(`Only an approved reel can be published; this reel is ${reel.status}`);
    if (!reel.approvedAt) throw new ConflictException('This reel has not been approved');
    if (!reel.videoUrl || reel.videoStale) throw new ConflictException('The video is out of date. Regenerate it and approve it again.');
    const hashtags = reel.hashtags ?? [];
    const caption = instagramCaption({ caption: reel.caption, hashtags });
    this.publishing.assertMeetsInstagramLimits(hashtags, caption);

    const account = await this.publishing.verifiedAccount(userId, reel.businessId);
    const moved = await this.repository.updateIf(id, reel.status, { status: 'PUBLISHING', error: null });
    if (!moved) throw new ConflictException('This reel is already being published');

    let wentLive = false;
    try {
      const { mediaId, permalink } = await this.publishing.publishReelVideo(account, reel.videoUrl, caption, () => {
        wentLive = true;
      });
      const published = await this.repository.updateIf(id, 'PUBLISHING', { status: 'PUBLISHED', instagramMediaId: mediaId, permalink, publishedAt: new Date(), error: null });
      this.logger.log({ event: 'reel_published', reelId: id, mediaId });
      return this.view(published ?? moved);
    } catch (error) {
      await this.failPublish(id, wentLive, error);
      throw error;
    }
  }

  private async failPublish(id: string, wentLive: boolean, error: unknown) {
    const message = wentLive ? AMBIGUOUS_PUBLISH : error instanceof HttpException ? error.message : 'Instagram did not accept the Reel. Nothing was posted; you can try again.';
    this.logger.warn({ event: 'reel_publish_failed', reelId: id, wentLive, message: String((error as Error).message ?? error).slice(0, 300) });
    try {
      await this.repository.updateIf(id, 'PUBLISHING', { status: 'PUBLISH_FAILED', publishAmbiguous: wentLive, error: message });
    } catch (recoveryError) {
      this.logger.error({ event: 'reel_publish_state_recovery_failed', reelId: id, message: (recoveryError as Error).message });
    }
  }
}
