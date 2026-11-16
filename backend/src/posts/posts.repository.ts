import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Language } from '../common/constants';
import { PrismaService } from '../database/prisma.service';
import type { PostStatus } from './posts.state';

const POST_FIELDS = [
  'id',
  'businessId',
  'conversationId',
  'productId',
  'originalImageUrl',
  'posterImageUrl',
  'caption',
  'headline',
  'callToAction',
  'hashtags',
  'language',
  'status',
  'instagramMediaId',
  'publishedAt',
  'createdAt',
  'updatedAt',
] as const;

export interface PostWrite {
  originalImageUrl?: string | null;
  productId?: string | null;
  conversationId?: string | null;
  caption?: string | null;
  headline?: string | null;
  callToAction?: string | null;
  hashtags?: string[] | null;
  language?: Language | null;
  posterImageUrl?: string | null;
}

interface TxImages {
  orm: {
    public: {
      PostImage: {
        select: (...fields: string[]) => { where: (w: (i: never) => unknown) => { all: () => Promise<unknown> } };
        where: (w: (i: never) => unknown) => { delete: () => Promise<unknown> };
        create: (d: object) => Promise<unknown>;
      };
    };
  };
}

export interface PostImageRecord {
  position: number;
  imageUrl: string;
}

export interface PostRecord {
  id: string;
  businessId: string;
  status: PostStatus;
  [key: string]: unknown;
}

@Injectable()
export class PostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get posts() {
    return this.prisma.db.orm.public.GeneratedPost;
  }

  /** Creates the post and its carousel in one transaction, so a post never exists with half its photos. */
  create(id: string, businessId: string, data: PostWrite, imageUrls: string[]) {
    return this.prisma.db.transaction(async (tx) => {
      const post = await tx.orm.public.GeneratedPost.select(...POST_FIELDS).create({
        id,
        businessId,
        status: 'DRAFT',
        ...data,
        hashtags: (data.hashtags ?? null) as never,
      });
      await this.writeImages(tx, id, imageUrls);
      return post;
    });
  }

  /** Photos for one post, in carousel order. */
  async imagesFor(postId: string): Promise<PostImageRecord[]> {
    return (await this.prisma.db.orm.public.PostImage.select('position', 'imageUrl').where({ postId }).orderBy((i) => i.position.asc()).all()) as PostImageRecord[];
  }

  /** Photos for many posts at once, so a list does not query per post. */
  async imagesForMany(postIds: string[]): Promise<Map<string, PostImageRecord[]>> {
    const map = new Map<string, PostImageRecord[]>();
    if (postIds.length === 0) return map;
    const rows = (await this.prisma.db.orm.public.PostImage.select('postId', 'position', 'imageUrl').where((i) => i.postId.in(postIds)).orderBy((i) => i.position.asc()).all()) as Array<PostImageRecord & { postId: string }>;
    for (const row of rows) {
      const list = map.get(row.postId) ?? [];
      list.push({ position: row.position, imageUrl: row.imageUrl });
      map.set(row.postId, list);
    }
    return map;
  }

  /** Every photo URL used by this business's published posts. Used to spot a photo that was already posted. */
  async publishedImageUrls(businessId: string): Promise<string[]> {
    const published = (await this.posts.select('id', 'instagramMediaId').where({ businessId, status: 'PUBLISHED' }).all()) as Array<{ id: string; instagramMediaId: string | null }>;
    const mediaIds = published.map((p) => p.instagramMediaId).filter((v): v is string => !!v);
    const removed = await this.removedMediaIds(businessId, mediaIds);
    const live = published.filter((p) => !(p.instagramMediaId && removed.has(p.instagramMediaId)));
    const byPost = await this.imagesForMany(live.map((p) => p.id));
    return [...byPost.values()].flat().map((i) => i.imageUrl);
  }

  /** Which of these Instagram media ids were removed (archived or deleted) on the business's accounts, per the last full sync. */
  async removedMediaIds(businessId: string, mediaIds: string[]): Promise<Set<string>> {
    if (mediaIds.length === 0) return new Set();
    const accounts = (await this.prisma.db.orm.public.SocialAccount.select('id').where({ businessId, platform: 'instagram' }).all()) as Array<{ id: string }>;
    if (accounts.length === 0) return new Set();
    const rows = (await this.prisma.db.orm.public.InstagramPost.select('platformMediaId', 'deletedAt').where((p) => p.socialAccountId.in(accounts.map((a) => a.id)) as never).all()) as Array<{ platformMediaId: string; deletedAt: Date | null }>;
    return new Set(rows.filter((r) => r.deletedAt !== null && mediaIds.includes(r.platformMediaId)).map((r) => r.platformMediaId));
  }

  /** Server-only: the post went out. Stores Instagram's media id and the time. */
  async recordPublished(id: string, instagramMediaId: string) {
    await this.posts.where({ id }).update({ status: 'PUBLISHED', instagramMediaId, publishedAt: new Date() });
    return this.findById(id);
  }

  /** Replaces a post's carousel inside the caller's transaction. */
  private async writeImages(tx: unknown, postId: string, imageUrls: string[]) {
    const images = (tx as TxImages).orm.public.PostImage;
    // Delete row by row: a multi-row delete through the ORM was observed to remove only part of the set.
    const old = (await images.select('id').where((i: { postId: { eq: (v: string) => unknown } }) => i.postId.eq(postId)).all()) as Array<{ id: string }>;
    for (const row of old) await images.where((i: { id: { eq: (v: string) => unknown } }) => i.id.eq(row.id)).delete();
    for (const [position, imageUrl] of imageUrls.entries()) {
      await images.create({ id: randomUUID(), postId, position, imageUrl });
    }
  }

  /**
   * Deletes a post and its photos, only while its status is one of `allowed`. The check and the delete share one
   * transaction. Returns the status found when it did not match, or null when the post is gone or was deleted.
   */
  deleteIfStatus(id: string, allowed: readonly PostStatus[]): Promise<{ deleted: boolean; status: PostStatus | null }> {
    return this.prisma.db.transaction(async (tx) => {
      const current = (await tx.orm.public.GeneratedPost.select('id', 'status').where({ id }).first()) as { status: PostStatus } | null;
      if (!current) return { deleted: false, status: null };
      if (!allowed.includes(current.status)) return { deleted: false, status: current.status };
      await this.writeImages(tx, id, []);
      await tx.orm.public.GeneratedPost.where({ id }).delete();
      return { deleted: true, status: current.status };
    });
  }

  list(businessId: string, status: PostStatus | undefined, take: number, offset: number) {
    const base = this.posts.select(...POST_FIELDS).where({ businessId });
    const filtered = status ? base.where({ status }) : base;
    return filtered
      .orderBy((p) => p.createdAt.desc())
      .limit(take)
      .offset(offset)
      .all();
  }

  findById(id: string) {
    return this.posts.select(...POST_FIELDS).where({ id }).first();
  }

  /**
   * Reads the post, lets `decide` check the rules and return the changes, then writes them.
   * The read and the write share one transaction, so two requests can't both approve the same preview.
   */
  transact(id: string, decide: (current: PostRecord) => { data: Partial<PostWrite>; status?: PostStatus; imageUrls?: string[] }) {
    return this.prisma.db.transaction(async (tx) => {
      const current = (await tx.orm.public.GeneratedPost.select(...POST_FIELDS).where({ id }).first()) as PostRecord | null;
      if (!current) return null;
      const { data, status, imageUrls } = decide(current);
      const changes: Record<string, unknown> = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      if (status) changes['status'] = status;
      if (changes['hashtags'] !== undefined) changes['hashtags'] = changes['hashtags'] as never;
      if (Object.keys(changes).length > 0) await tx.orm.public.GeneratedPost.where({ id }).update(changes as never);
      if (imageUrls) await this.writeImages(tx, id, imageUrls);
      return tx.orm.public.GeneratedPost.select(...POST_FIELDS).where({ id }).first();
    });
  }
}
