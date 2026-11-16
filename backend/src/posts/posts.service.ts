import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { ConversationsRepository } from '../conversations/conversations.repository';
import { pageArgs, toPage, type Page } from '../common/pagination';
import { ProductsRepository } from '../products/products.repository';
import { MediaRepository } from '../media/media.repository';
import { InstagramSyncService } from '../instagram/instagram-sync.service';
import { MAX_CAROUSEL_IMAGES, type CreatePostDto, type ListPostsQueryDto, type UpdatePostDto } from './posts.dto';
import { PostsRepository, type PostRecord, type PostWrite } from './posts.repository';
import { canTransition, EDITABLE_STATUSES, type PostStatus } from './posts.state';

// \p{M} (combining marks) is required: Devanagari vowel signs such as the ा in "नयाकलेक्शन" are marks, not letters.
const HASHTAG = /^#[\p{L}\p{M}\p{N}_]{1,59}$/u;
const CONTENT_FIELDS = ['caption', 'headline', 'callToAction', 'hashtags', 'language', 'posterImageUrl'] as const;

/** Carousel photos in order, each one an upload that belongs to this business. The same photo may appear more than once. */
function uniqueUrls(urls: string[]): string[] {
  return urls.map((u) => u.trim());
}

/** Normalises hashtags to "#Tag" form and rejects anything else. */
export function normaliseHashtags(tags: string[]): string[] {
  return tags.map((raw) => {
    const tag = raw.trim().replace(/\s+/g, '');
    const withHash = tag.startsWith('#') ? tag : `#${tag}`;
    if (!HASHTAG.test(withHash)) throw new BadRequestException(`Invalid hashtag: ${raw}`);
    return withHash;
  });
}

@Injectable()
export class PostsService {
  constructor(
    private readonly business: BusinessService,
    private readonly repository: PostsRepository,
    private readonly products: ProductsRepository,
    private readonly conversations: ConversationsRepository,
    private readonly media: MediaRepository,
    @Optional() private readonly instagramSync?: InstagramSyncService,
  ) {}

  /** Each photo must be an upload from this business (from /media/upload). Returns each photo's content hash, in order. */
  private async assertOwnPhotos(businessId: string, urls: string[]): Promise<string[]> {
    if (urls.length > MAX_CAROUSEL_IMAGES) throw new BadRequestException(`A carousel can hold up to ${MAX_CAROUSEL_IMAGES} photos`);
    const hashes: string[] = [];
    for (const url of urls) {
      const asset = await this.media.findBySecureUrl(url);
      if (!asset || asset.businessId !== businessId) {
        throw new BadRequestException('Each photo must be uploaded through GrowPilot first (POST /media/upload)');
      }
      if (asset.sourceAssetId && !asset.approvedAt) {
        throw new BadRequestException('Approve the edited photo in Photo Studio before using it in a post');
      }
      hashes.push(await this.identityHash(asset));
    }
    return hashes;
  }

  /** Content hashes (SHA-256 of the file bytes) for photos this business uploaded. Unknown URLs are skipped. */
  async photoHashes(urls: string[]): Promise<string[]> {
    const hashes: string[] = [];
    for (const url of urls) {
      const asset = await this.media.findBySecureUrl(url);
      if (asset) hashes.push(await this.identityHash(asset));
    }
    return hashes;
  }

  /** An edited photo counts as the same picture as the original it was made from. */
  private async identityHash(asset: { sha256: string; sourceAssetId?: string | null }): Promise<string> {
    if (!asset.sourceAssetId) return asset.sha256;
    const source = await this.media.findById(asset.sourceAssetId);
    return source?.sha256 ?? asset.sha256;
  }

  /**
   * Refuses a post whose photo was already published, comparing file content (hash), not URLs.
   * Runs before any AI request, so a duplicate costs nothing.
   */
  async assertNotPublishedDuplicate(businessId: string, urls: string[]) {
    if (urls.length === 0) return;
    const mine = new Set(await this.photoHashes(urls));
    if (mine.size === 0) return;
    const collides = async () => {
      const published = new Set(await this.photoHashes(await this.repository.publishedImageUrls(businessId)));
      return [...mine].some((h) => published.has(h));
    };
    if (!(await collides())) return;
    // The post may have been archived or deleted on Instagram since the last sync: check Instagram once before refusing.
    if (this.instagramSync && (await this.instagramSync.syncBusinessNow(businessId)) && !(await collides())) return;
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: 'DUPLICATE_PHOTO',
      message: 'Duplicate: this photo is already live on your Instagram. Choose a different photo, or archive that post on Instagram first.',
    });
  }

  private withImages<T extends { id: string }>(post: T, images: Array<{ position: number; imageUrl: string }>) {
    return { ...post, images: images.map((i) => ({ position: i.position, imageUrl: i.imageUrl })) };
  }

  /** Marks a published post whose Instagram media was archived or deleted (per the last full sync). */
  private async withRemoval<T extends object>(businessId: string, posts: T[]): Promise<Array<T & { removedFromInstagram: boolean }>> {
    const view = (p: T) => p as unknown as { status: string; instagramMediaId: string | null };
    const ids = posts.map(view).filter((p) => p.status === 'PUBLISHED' && p.instagramMediaId).map((p) => p.instagramMediaId as string);
    const removed = await this.repository.removedMediaIds(businessId, ids);
    return posts.map((post) => {
      const p = view(post);
      return { ...post, removedFromInstagram: p.status === 'PUBLISHED' && !!p.instagramMediaId && removed.has(p.instagramMediaId) };
    });
  }

  async create(userId: string, dto: CreatePostDto) {
    const businessId = await this.business.primaryBusinessId(userId);
    await this.assertLinksBelongTo(businessId, dto.productId, dto.conversationId);
    const imageUrls = uniqueUrls(dto.imageUrls ?? (dto.originalImageUrl ? [dto.originalImageUrl] : []));
    await this.assertOwnPhotos(businessId, imageUrls);
    await this.assertNotPublishedDuplicate(businessId, imageUrls);
    const data: PostWrite = {
      originalImageUrl: imageUrls[0] ?? null,
      productId: dto.productId ?? null,
      conversationId: dto.conversationId ?? null,
      caption: dto.caption ?? null,
      headline: dto.headline ?? null,
      callToAction: dto.callToAction ?? null,
      hashtags: dto.hashtags ? normaliseHashtags(dto.hashtags) : null,
      language: dto.language ?? null,
      posterImageUrl: dto.posterImageUrl ?? null,
    };
    const post = await this.repository.create(randomUUID(), businessId, data, imageUrls);
    return this.withImages(post, await this.repository.imagesFor(post.id));
  }

  async list(userId: string, query: ListPostsQueryDto): Promise<Page<unknown>> {
    const businessId = await this.business.primaryBusinessId(userId);
    const { take, offset } = pageArgs(query);
    const rows = await this.repository.list(businessId, query.status, take, offset);
    const images = await this.repository.imagesForMany(rows.map((r) => r.id));
    const marked = await this.withRemoval(businessId, rows);
    return toPage(marked.map((r) => this.withImages(r, images.get(r.id) ?? [])), query);
  }

  async get(userId: string, id: string) {
    const post = await this.owned(userId, id);
    const [marked] = await this.withRemoval(post.businessId, [post]);
    return this.withImages(marked, await this.repository.imagesFor(id));
  }

  /**
   * Owner edits and approval. Content changes require an editable status; approval requires PREVIEW_READY.
   * Both happen in one transaction, so a request can't change content after approval.
   */
  async update(userId: string, id: string, dto: UpdatePostDto) {
    const existing = await this.owned(userId, id);
    const wantsContent = CONTENT_FIELDS.some((key) => dto[key] !== undefined) || dto.imageUrls !== undefined;
    const wantsApproval = dto.status === 'USER_APPROVED';
    const wantsReopen = dto.status === 'PREVIEW_READY';
    if (!wantsContent && !wantsApproval && !wantsReopen) return this.withImages(existing, await this.repository.imagesFor(id));
    const imageUrls = dto.imageUrls === undefined ? undefined : uniqueUrls(dto.imageUrls);
    if (imageUrls) {
      await this.assertOwnPhotos(existing.businessId, imageUrls);
      await this.assertNotPublishedDuplicate(existing.businessId, imageUrls);
    }

    const contentData: Partial<PostWrite> = {};
    for (const key of CONTENT_FIELDS) {
      if (dto[key] === undefined) continue;
      (contentData as Record<string, unknown>)[key] = key === 'hashtags' ? normaliseHashtags(dto.hashtags ?? []) : dto[key];
    }

    const updated = await this.repository.transact(id, (current) => {
      const status = current.status as PostStatus;
      if (wantsContent && !EDITABLE_STATUSES.includes(status)) {
        throw new ConflictException(`A post in ${status} can't be edited; reopen it first`);
      }
      if (wantsApproval && !canTransition(status, 'USER_APPROVED')) {
        throw new ConflictException(`Only a preview (PREVIEW_READY) can be approved; this post is ${status}`);
      }
      if (wantsReopen && !canTransition(status, 'PREVIEW_READY')) {
        throw new ConflictException(`Only an approved draft can be reopened for editing; this post is ${status}`);
      }
      const data = imageUrls ? { ...contentData, originalImageUrl: imageUrls[0] ?? null } : contentData;
      return { data, status: wantsApproval ? ('USER_APPROVED' as const) : wantsReopen ? ('PREVIEW_READY' as const) : undefined, imageUrls };
    });
    if (!updated) throw new NotFoundException('Post not found');
    return this.withImages(updated, await this.repository.imagesFor(id));
  }

  /** Deletes a pending draft (not yet approved). Approved, publishing and published posts are kept. */
  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    const result = await this.repository.deleteIfStatus(id, EDITABLE_STATUSES);
    if (result.status === null) throw new NotFoundException('Post not found');
    if (!result.deleted) throw new ConflictException(`Only a pending draft can be deleted; this post is ${result.status}`);
  }

  /**
   * Server-side status change (for example PREVIEW_READY after generation, or PUBLISHING).
   * Not exposed as a route, so clients can't move a post into publishing states.
   */
  async moveTo(id: string, to: PostStatus) {
    const updated = await this.repository.transact(id, (current) => {
      if (!canTransition(current.status as PostStatus, to)) {
        throw new ConflictException(`Cannot move a post from ${current.status} to ${to}`);
      }
      return { data: {}, status: to };
    });
    if (!updated) throw new NotFoundException('Post not found');
    return updated;
  }

  /** Photos of a post, in order. Used by the AI step and the publisher. */
  imageUrlsOf(postId: string): Promise<Array<{ position: number; imageUrl: string }>> {
    return this.repository.imagesFor(postId);
  }

  /** Product and conversation links must belong to the same business, so a post can't point at another owner's data. */
  private async assertLinksBelongTo(businessId: string, productId?: string, conversationId?: string) {
    if (productId) {
      const product = (await this.products.findById(productId)) as { businessId: string } | null;
      if (!product || product.businessId !== businessId) throw new BadRequestException('productId does not belong to your business');
    }
    if (conversationId) {
      const conversation = await this.conversations.findById(conversationId);
      if (!conversation || conversation.businessId !== businessId) {
        throw new BadRequestException('conversationId does not belong to your business');
      }
    }
  }

  private async owned(userId: string, id: string): Promise<PostRecord> {
    const businessId = await this.business.primaryBusinessId(userId);
    const post = (await this.repository.findById(id)) as PostRecord | null;
    if (!post || post.businessId !== businessId) throw new NotFoundException('Post not found');
    return post;
  }
}
