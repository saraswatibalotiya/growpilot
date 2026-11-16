import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUniqueViolation } from '../common/database-errors';
import { InstagramGraphClient } from './instagram-graph.client';
import type { InstagramMediaItem } from './instagram-graph.types';
import { InstagramSyncQueue } from './instagram-sync.queue';
import { InstagramSyncRepository } from './instagram-sync.repository';
import type { PostWrite } from './instagram-sync.types';
import { InstagramService, type OwnedAccount } from './instagram.service';
import { MetaApiError } from './meta-api.error';

/** Per-post insight metrics requested from Meta. Anything not returned is stored as null. */
const MEDIA_INSIGHT_METRICS = ['reach', 'views', 'saves', 'shares', 'profile_visits'] as const;

const PAGE_SIZE = 50;
/** A queued/running run younger than this blocks a new one (covers the retry/backoff window). */
const ACTIVE_RUN_WINDOW_MS = 45 * 60 * 1000;

/** Thrown for a run that must not be retried (or has used its last attempt). */
export class SyncJobFailed extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SyncJobFailed';
  }
}
/** Thrown for a failure BullMQ should retry with backoff. */
export class SyncRetryable extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SyncRetryable';
  }
}

interface Classified {
  code: string;
  message: string;
  retryable: boolean;
}

@Injectable()
export class InstagramSyncService {
  private readonly logger = new Logger(InstagramSyncService.name);

  constructor(
    private readonly instagram: InstagramService,
    private readonly graph: InstagramGraphClient,
    private readonly repository: InstagramSyncRepository,
    private readonly queue: InstagramSyncQueue,
    private readonly config: ConfigService,
  ) {}

  // ---------- API: request a sync ----------

  /** Owner-only. Live mode only. Returns the queued run, or the run already in progress. */
  async requestMediaSync(userId: string, accountId: string) {
    const account = await this.instagram.owned(userId, accountId);
    this.assertLiveAccount(account);
    if (account.status !== 'connected') {
      throw new ConflictException(`Instagram account is ${account.status}; reconnect it before syncing`);
    }

    const active = (await this.repository.recentRuns(account.id, 5)).find(
      (run) =>
        run.kind === 'media' &&
        (run.status === 'queued' || run.status === 'running') &&
        Date.now() - run.startedAt.getTime() < ACTIVE_RUN_WINDOW_MS,
    );
    if (active) return { run: active, alreadyInProgress: true };

    const run = await this.repository.createRun(randomUUID(), account.id, 'media');
    try {
      await this.queue.enqueueMediaSync({ accountId: account.id, runId: run.id });
    } catch (error) {
      this.logger.error({ event: 'instagram_sync_enqueue_failed', accountId: account.id, runId: run.id, message: (error as Error).message });
      await this.repository.updateRun(run.id, {
        status: 'failed',
        finishedAt: new Date(),
        errorCode: 'queue_unavailable',
        errorMessage: 'Could not queue the sync job; is Redis running?',
      });
      throw new ServiceUnavailableException('Sync queue unavailable; try again shortly');
    }
    return { run, alreadyInProgress: false };
  }

  /**
   * Runs a fresh media sync for the business's live account and waits for it, so archived or deleted posts are known
   * before we decide a photo is a duplicate. Returns true only if the sync finished in time. Never throws.
   */
  async syncBusinessNow(businessId: string, waitMs = 20_000): Promise<boolean> {
    try {
      const account = await this.repository.findAccountByBusiness(businessId);
      if (!account || account.isMock || account.status !== 'connected') return false;
      const run = await this.repository.createRun(randomUUID(), account.id, 'media');
      await this.queue.enqueueMediaSync({ accountId: account.id, runId: run.id });
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const current = await this.repository.findRun(run.id);
        if (current?.status === 'succeeded') return true;
        if (current?.status === 'failed') return false;
      }
      return false;
    } catch (error) {
      this.logger.warn({ event: 'instagram_sync_now_failed', businessId, message: (error as Error).message });
      return false;
    }
  }

  async listRuns(userId: string, accountId: string) {
    const account = await this.instagram.owned(userId, accountId);
    return this.repository.recentRuns(account.id, 20);
  }

  // ---------- Worker: run a sync ----------

  /**
   * Executes one media sync. Throws SyncRetryable (BullMQ retries with backoff) or SyncJobFailed (final).
   * Idempotent: posts are upserted on (social_account_id, platform_media_id); snapshots are appended.
   */
  async runMediaSync(accountId: string, runId: string, isLastAttempt: boolean): Promise<number> {
    const startedAt = new Date();
    await this.repository.updateRun(runId, { status: 'running', errorCode: null, errorMessage: null });
    try {
      const account = await this.repository.findAccountById(accountId);
      if (!account) throw new SyncJobFailed('account_not_found', 'Instagram account no longer exists');
      this.assertLiveAccount(account);

      const processed = await this.instagram.withToken(account, (token) =>
        this.syncMedia(account, token, startedAt),
      );
      await this.repository.markMediaSynced(accountId, startedAt);
      await this.repository.updateRun(runId, {
        status: 'succeeded',
        finishedAt: new Date(),
        itemsProcessed: processed,
      });
      this.logger.log({ event: 'instagram_media_sync_done', accountId, runId, itemsProcessed: processed });
      return processed;
    } catch (error: unknown) {
      const failure = this.classify(error);
      // Only ids and our own safe messages are logged: never tokens, URLs or raw Meta text.
      this.logger.warn({ event: 'instagram_media_sync_failed', accountId, runId, code: failure.code, retryable: failure.retryable });
      if (!failure.retryable || isLastAttempt) {
        await this.repository.updateRun(runId, {
          status: 'failed',
          finishedAt: new Date(),
          errorCode: failure.code,
          errorMessage: failure.message,
        });
        throw new SyncJobFailed(failure.code, failure.message);
      }
      await this.repository.updateRun(runId, {
        status: 'queued',
        errorCode: failure.code,
        errorMessage: `Retrying after: ${failure.message}`,
      });
      throw new SyncRetryable(failure.code, failure.message);
    }
  }

  // ---------- internals ----------

  private async syncMedia(account: OwnedAccount, token: string, startedAt: Date): Promise<number> {
    const maxPages = this.intConfig('INSTAGRAM_SYNC_MAX_PAGES', 20);
    const insightsLimit = this.intConfig('INSTAGRAM_SYNC_INSIGHTS_LIMIT', 25);
    const delayMs = this.intConfig('INSTAGRAM_SYNC_REQUEST_DELAY_MS', 250);

    let after: string | undefined;
    let pages = 0;
    let processed = 0;
    let insightsFetched = 0;
    let insightsAvailable = true;
    const seen = new Set<string>();

    do {
      const page = await this.graph.getMedia(token, account.platformAccountId, { limit: PAGE_SIZE, after });
      for (const item of page.items) {
        seen.add(item.id);
        const postId = await this.upsertPost(account.id, item, startedAt);

        // Unknown stays null. Likes/comments come from the media list; the rest from per-post insights.
        let insights: Record<string, number | null> = {};
        if (insightsAvailable && insightsFetched < insightsLimit) {
          insightsFetched++;
          try {
            insights = await this.graph.getMediaInsights(token, item.id, MEDIA_INSIGHT_METRICS);
          } catch (error) {
            if (error instanceof MetaApiError && error.isPermissionError) {
              insightsAvailable = false; // token lacks insights permission: keep syncing posts without them
              this.logger.warn({ event: 'instagram_media_insights_unavailable', accountId: account.id });
            } else {
              throw error; // auth, rate limit, outage: let withToken/classify handle (and retry)
            }
          }
          if (delayMs > 0) await sleep(delayMs);
        }
        await this.repository.insertSnapshot(randomUUID(), {
          instagramPostId: postId,
          capturedAt: new Date(),
          likes: item.likeCount,
          comments: item.commentsCount,
          reach: insights['reach'] ?? null,
          views: insights['views'] ?? null,
          saves: insights['saves'] ?? null,
          shares: insights['shares'] ?? null,
          profileVisits: insights['profile_visits'] ?? null,
        });
        processed++;
      }
      after = page.nextCursor ?? undefined;
      pages++;
    } while (after && pages < maxPages);
    // Only a sync that read every page can tell us what is gone. A capped or partial read marks nothing.
    // An empty list counts: Instagram answers a failed request with an error, never with an empty list.
    if (!after) {
      const removed = await this.repository.markMissing(account.id, seen, startedAt);
      if (removed > 0) this.logger.log({ event: 'instagram_media_removed', accountId: account.id, count: removed });
    }
    return processed;
  }

  private async upsertPost(accountId: string, item: InstagramMediaItem, seenAt: Date): Promise<string> {
    const data: PostWrite = {
      mediaType: item.mediaType,
      mediaProductType: item.mediaProductType,
      caption: item.caption,
      permalink: item.permalink,
      mediaUrl: item.mediaUrl,
      thumbnailUrl: item.thumbnailUrl,
      publishedAt: parseInstagramTime(item.timestamp),
      lastSeenAt: seenAt,
      deletedAt: null,
    };
    const existing = await this.repository.findPostId(accountId, item.id);
    if (existing) {
      await this.repository.updatePost(existing.id, data);
      return existing.id;
    }
    try {
      return (await this.repository.createPost(randomUUID(), accountId, item.id, data)).id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Lost a race with a concurrent run: the post exists now, so update it instead.
      const raced = await this.repository.findPostId(accountId, item.id);
      if (!raced) throw error;
      await this.repository.updatePost(raced.id, data);
      return raced.id;
    }
  }

  /** Sync is live-only: mock accounts and mock mode are refused. */
  private assertLiveAccount(account: { isMock: boolean }) {
    if (this.graph.mode !== 'live') {
      throw new ConflictException('Media sync requires INSTAGRAM_MODE=live');
    }
    if (account.isMock) {
      throw new ConflictException('Mock accounts cannot be synced; connect a real account in live mode');
    }
  }

  private classify(error: unknown): Classified {
    if (error instanceof SyncJobFailed) return { code: error.code, message: error.message, retryable: false };
    if (error instanceof NotFoundException) return { code: 'account_not_found', message: error.message, retryable: false };
    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === 429) return { code: 'rate_limited', message: error.message, retryable: true };
      if (status === 502 || status === 503 || status === 504) {
        return { code: 'instagram_unavailable', message: error.message, retryable: true };
      }
      if (status === 409) return { code: 'reconnect_required', message: error.message, retryable: false };
      if (status === 403) return { code: 'permission_denied', message: error.message, retryable: false };
      return { code: 'internal', message: 'Unexpected error during sync', retryable: false };
    }
    if (error instanceof MetaApiError) {
      if (error.isRateLimit) return { code: 'rate_limited', message: 'Instagram rate limit reached', retryable: true };
      if (error.isAuthError) return { code: 'reconnect_required', message: 'Instagram connection expired', retryable: false };
      return { code: 'instagram_unavailable', message: 'Instagram request failed', retryable: error.httpStatus >= 500 };
    }
    return { code: 'internal', message: 'Unexpected error during sync', retryable: true };
  }

  private intConfig(name: string, fallback: number): number {
    const value = Number(this.config.get<string>(name));
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Instagram sends "2026-01-01T00:00:00+0000"; normalise the offset so Date parses it reliably. */
export function parseInstagramTime(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}
