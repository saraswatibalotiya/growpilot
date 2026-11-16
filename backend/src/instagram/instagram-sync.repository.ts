import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../common/database-errors';
import { PrismaService } from '../database/prisma.service';
import type { PostIdRow, PostWrite, SnapshotWrite, SocialAccountRecord, SyncAccountSummary, SyncKindName, SyncRunPatch, SyncRunRecord } from './instagram-sync.types';

@Injectable()
export class InstagramSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get orm() {
    return this.prisma.db.orm.public;
  }

  /** Full account row including the encrypted token: for the worker only, never returned to clients. */
  findAccountById(accountId: string): Promise<SocialAccountRecord | null> {
    return this.orm.SocialAccount.where({ id: accountId, platform: 'instagram' }).first();
  }

  findAccountByBusiness(businessId: string): Promise<SyncAccountSummary | null> {
    return this.orm.SocialAccount.select('id', 'isMock', 'status').where({ businessId, platform: 'instagram' }).first();
  }

  async markMediaSynced(accountId: string, at: Date): Promise<void> {
    await this.orm.SocialAccount.where({ id: accountId }).update({ lastMediaSyncAt: at });
  }

  // ---- sync_runs ----

  createRun(id: string, socialAccountId: string, kind: SyncKindName): Promise<SyncRunRecord> {
    return this.orm.SyncRun.create({ id, socialAccountId, kind, status: 'queued' });
  }

  async updateRun(id: string, patch: SyncRunPatch): Promise<SyncRunRecord | null> {
    await this.orm.SyncRun.where({ id }).update(patch);
    return this.orm.SyncRun.where({ id }).first();
  }

  findRun(id: string): Promise<SyncRunRecord | null> {
    return this.orm.SyncRun.where({ id }).first();
  }

  async recentRuns(socialAccountId: string, limit: number): Promise<SyncRunRecord[]> {
    return await this.orm.SyncRun
      .where({ socialAccountId })
      .orderBy((run) => run.startedAt.desc())
      .limit(limit)
      .all();
  }

  // ---- instagram_posts / post_metric_snapshots ----

  findPostId(socialAccountId: string, platformMediaId: string): Promise<PostIdRow | null> {
    return this.orm.InstagramPost.select('id').where({ socialAccountId, platformMediaId }).first();
  }

  createPost(id: string, socialAccountId: string, platformMediaId: string, data: PostWrite): Promise<PostIdRow> {
    return this.orm.InstagramPost.select('id').create({ id, socialAccountId, platformMediaId, ...data });
  }

  async updatePost(id: string, data: PostWrite): Promise<void> {
    await this.orm.InstagramPost.where({ id }).update(data);
  }

  /** Append-only: snapshots are only ever inserted. */
  /**
   * Marks posts that were not returned by a COMPLETE media sync as removed (deletedAt). Archived or deleted posts
   * drop out of the Instagram media list, so this is how we learn about them. Posts that come back are un-marked
   * by upsertPost. Only call this after a sync that read every page.
   */
  async markMissing(accountId: string, seen: Set<string>, at: Date): Promise<number> {
    const live = (await this.orm.InstagramPost.select('id', 'platformMediaId').where({ socialAccountId: accountId, deletedAt: null }).all()) as Array<{ id: string; platformMediaId: string }>;
    const gone = live.filter((row) => !seen.has(row.platformMediaId));
    for (const row of gone) await this.orm.InstagramPost.where({ id: row.id }).update({ deletedAt: at });

    // Posts GrowPilot published that are missing from the list too. Some of them have never had a row here (for example
    // when the account's list was empty), so they get one, marked removed. Only posts published before this sync started:
    // a post that went out during the sync may not be in the list yet.
    const account = (await this.orm.SocialAccount.select('businessId').where({ id: accountId }).first()) as { businessId: string } | null;
    if (!account) return gone.length;
    const published = (await this.prisma.db.orm.public.GeneratedPost.select('instagramMediaId', 'publishedAt')
      .where({ businessId: account.businessId, status: 'PUBLISHED' })
      .all()) as Array<{ instagramMediaId: string | null; publishedAt: Date | null }>;
    const known = new Set((await this.orm.InstagramPost.select('platformMediaId').where({ socialAccountId: accountId }).all() as Array<{ platformMediaId: string }>).map((r) => r.platformMediaId));
    let added = 0;
    for (const post of published) {
      const mediaId = post.instagramMediaId;
      if (!mediaId || seen.has(mediaId) || known.has(mediaId) || !post.publishedAt || post.publishedAt >= at) continue;
      try {
        await this.createPost(randomUUID(), accountId, mediaId, { mediaType: null, mediaProductType: null, caption: null, permalink: null, mediaUrl: null, thumbnailUrl: null, publishedAt: post.publishedAt, lastSeenAt: at, deletedAt: at });
        added++;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return gone.length + added;
  }

  /** Instagram media ids that were removed (archived or deleted) on a business's connected accounts. */
  async removedMediaIds(businessId: string): Promise<Set<string>> {
    const accounts = (await this.orm.SocialAccount.select('id').where({ businessId, platform: 'instagram' }).all()) as Array<{ id: string }>;
    if (accounts.length === 0) return new Set();
    const rows = (await this.orm.InstagramPost.select('platformMediaId', 'deletedAt').where((p) => p.socialAccountId.in(accounts.map((a) => a.id))).all()) as Array<{ platformMediaId: string; deletedAt: Date | null }>;
    return new Set(rows.filter((r) => r.deletedAt !== null).map((r) => r.platformMediaId));
  }

  async insertSnapshot(id: string, data: SnapshotWrite): Promise<void> {
    await this.orm.PostMetricSnapshot.create({ id, ...data });
  }
}
