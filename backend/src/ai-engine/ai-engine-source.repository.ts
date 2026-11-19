import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AccountFacts, BusinessFacts, PostFacts } from './ai-engine.types';

/** Read-only access to what the engine is given. This module never writes to GrowPilot's tables. */
@Injectable()
export class AiEngineSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get orm() {
    return this.prisma.db.orm.public;
  }

  /** The signed-in user's own business. The caller never supplies a business id. */
  async findBusinessForUser(userId: string): Promise<BusinessFacts | null> {
    return (await this.orm.Business
      .select('id', 'name', 'category', 'description', 'city', 'area', 'targetAudience', 'preferredLanguage', 'primaryGoal')
      .where({ userId })
      .orderBy((b) => b.createdAt.asc())
      .first()) as BusinessFacts | null;
  }

  async findInstagramAccount(businessId: string): Promise<AccountFacts | null> {
    return (await this.orm.SocialAccount.select('id', 'username', 'isMock', 'status').where({ businessId, platform: 'instagram' }).first()) as AccountFacts | null;
  }

  async productNames(businessId: string, limit: number): Promise<string[]> {
    const rows = (await this.orm.Product.select('name').where({ businessId, isAvailable: true }).limit(limit).all()) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  /** The most recent live posts (not removed) with their latest metric snapshot. */
  async recentPosts(accountId: string, followerCount: number | null, limit: number): Promise<PostFacts[]> {
    const posts = (await this.orm.InstagramPost
      .select('id', 'platformMediaId', 'mediaType', 'mediaProductType', 'caption', 'permalink', 'publishedAt')
      .where({ socialAccountId: accountId, deletedAt: null })
      .orderBy((p) => p.publishedAt.desc())
      .limit(limit)
      .all()) as Array<{ id: string; platformMediaId: string; mediaType: string | null; mediaProductType: string | null; caption: string | null; permalink: string | null; publishedAt: Date | null }>;
    const dated = posts.filter((p) => p.publishedAt !== null);
    if (dated.length === 0) return [];

    const snapshots = (await this.orm.PostMetricSnapshot
      .select('instagramPostId', 'capturedAt', 'reach', 'views', 'likes', 'comments', 'saves', 'shares')
      .where((s) => s.instagramPostId.in(dated.map((p) => p.id)) as never)
      .orderBy((s) => s.capturedAt.desc())
      .all()) as Array<{ instagramPostId: string; reach: number | null; views: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null }>;
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snap of snapshots) if (!latest.has(snap.instagramPostId)) latest.set(snap.instagramPostId, snap); // newest first

    return dated.map((p) => {
      const s = latest.get(p.id);
      return {
        platformMediaId: p.platformMediaId,
        mediaType: p.mediaType,
        mediaProductType: p.mediaProductType,
        caption: p.caption,
        permalink: p.permalink,
        publishedAt: p.publishedAt as Date,
        metrics: s ? { views: s.views, reach: s.reach, likes: s.likes, comments: s.comments, saves: s.saves, shares: s.shares } : null,
        followerCount,
      };
    });
  }

  async followerCount(accountId: string): Promise<number | null> {
    const row = (await this.orm.SocialAccount.select('followerCount').where({ id: accountId }).first()) as { followerCount: number | null } | null;
    return row?.followerCount ?? null;
  }
}
