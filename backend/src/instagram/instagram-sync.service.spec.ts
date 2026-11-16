import { ConflictException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InstagramGraphClient } from './instagram-graph.client';
import type { InstagramMediaItem } from './instagram-graph.types';
import type { InstagramSyncQueue } from './instagram-sync.queue';
import type { InstagramSyncRepository } from './instagram-sync.repository';
import type { PostWrite, SnapshotWrite, SyncRunPatch } from './instagram-sync.types';
import { InstagramSyncService, parseInstagramTime, SyncJobFailed, SyncRetryable } from './instagram-sync.service';
import type { InstagramService } from './instagram.service';
import { MetaApiError } from './meta-api.error';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECRET_TOKEN = 'EAAsecret-token-must-never-leak';

function media(id: string, extra: Partial<InstagramMediaItem> = {}): InstagramMediaItem {
  return {
    id,
    caption: `caption ${id}`,
    mediaType: 'IMAGE',
    mediaProductType: 'FEED',
    permalink: `https://instagram.com/p/${id}`,
    thumbnailUrl: null,
    mediaUrl: null,
    timestamp: '2026-01-01T10:00:00+0000',
    likeCount: 5,
    commentsCount: 1,
    ...extra,
  };
}

/** In-memory stand-in for the Postgres repository, enforcing the same unique key. */
class FakeRepo {
  account: Record<string, any> = { id: ACCOUNT_ID, platformAccountId: 'ig-1', isMock: false, status: 'connected', accessTokenEncrypted: 'enc' };
  posts = new Map<string, { id: string } & PostWrite>();
  snapshots: Array<{ id: string } & SnapshotWrite> = [];
  runs = new Map<string, any>();
  lastMediaSyncAt: Date | null = null;

  findAccountById = jest.fn(async (id: string) => (id === this.account['id'] ? this.account : null));
  markMediaSynced = jest.fn(async (_id: string, at: Date) => void (this.lastMediaSyncAt = at));
  createRun = jest.fn(async (id: string, socialAccountId: string, kind: string) => {
    const run = { id, socialAccountId, kind, status: 'queued', startedAt: new Date(), finishedAt: null, itemsProcessed: 0, errorCode: null, errorMessage: null };
    this.runs.set(id, run);
    return run;
  });
  updateRun = jest.fn(async (id: string, patch: SyncRunPatch) => Object.assign(this.runs.get(id), patch));
  recentRuns = jest.fn(async () => [...this.runs.values()].reverse());
  findPostId = jest.fn(async (accountId: string, mediaId: string) => this.posts.get(`${accountId}:${mediaId}`) ?? null);
  createPost = jest.fn(async (id: string, accountId: string, mediaId: string, data: PostWrite) => {
    const key = `${accountId}:${mediaId}`;
    if (this.posts.has(key)) throw { sqlState: '23505' };
    this.posts.set(key, { id, ...data });
    return { id };
  });
  updatePost = jest.fn(async (id: string, data: PostWrite) => {
    for (const [key, post] of this.posts) if (post.id === id) this.posts.set(key, { id, ...data });
  });
  insertSnapshot = jest.fn(async (id: string, data: SnapshotWrite) => void this.snapshots.push({ id, ...data }));
  markMissing = jest.fn(async (accountId: string, seen: Set<string>, at: Date) => {
    let n = 0;
    for (const [key, post] of this.posts) {
      const mediaId = key.slice(accountId.length + 1);
      if (key.startsWith(`${accountId}:`) && post.deletedAt === null && !seen.has(mediaId)) {
        this.posts.set(key, { ...post, deletedAt: at });
        n++;
      }
    }
    return n;
  });
}

function build(overrides: { mode?: 'live' | 'mock' } = {}) {
  const repo = new FakeRepo();
  const graph = {
    mode: overrides.mode ?? 'live',
    getMedia: jest.fn(),
    getMediaInsights: jest.fn().mockResolvedValue({ reach: 100, views: 200, saves: 3, shares: 2, profile_visits: null }),
  };
  const instagram = {
    owned: jest.fn(async () => repo.account),
    withToken: jest.fn(async (_account: unknown, call: (token: string) => Promise<unknown>) => call(SECRET_TOKEN)),
  };
  const queue = { enqueueMediaSync: jest.fn().mockResolvedValue(undefined) };
  const service = new InstagramSyncService(
    instagram as unknown as InstagramService,
    graph as unknown as InstagramGraphClient,
    repo as unknown as InstagramSyncRepository,
    queue as unknown as InstagramSyncQueue,
    new ConfigService({ INSTAGRAM_SYNC_REQUEST_DELAY_MS: '0' }),
  );
  return { service, repo, graph, instagram, queue };
}

async function newRun(repo: FakeRepo) {
  return (await repo.createRun(`run-${repo.runs.size + 1}`, ACCOUNT_ID, 'media')).id;
}

describe('InstagramSyncService.runMediaSync', () => {
  it('follows the cursor across pages and upserts posts', async () => {
    const { service, repo, graph } = build();
    graph.getMedia
      .mockResolvedValueOnce({ items: [media('m1'), media('m2')], nextCursor: 'CURSOR2' })
      .mockResolvedValueOnce({ items: [media('m3')], nextCursor: null });

    const runId = await newRun(repo);
    const processed = await service.runMediaSync(ACCOUNT_ID, runId, false);

    expect(processed).toBe(3);
    expect(graph.getMedia).toHaveBeenNthCalledWith(1, SECRET_TOKEN, 'ig-1', { limit: 50, after: undefined });
    expect(graph.getMedia).toHaveBeenNthCalledWith(2, SECRET_TOKEN, 'ig-1', { limit: 50, after: 'CURSOR2' });
    expect(repo.posts.size).toBe(3);
    expect(repo.runs.get(runId)).toMatchObject({ status: 'succeeded', itemsProcessed: 3, errorCode: null });
    expect(repo.lastMediaSyncAt).toBeInstanceOf(Date);
  });

  it('is idempotent: a re-run creates no duplicate posts but appends snapshots', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValue({ items: [media('m1'), media('m2')], nextCursor: null });

    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);

    expect(repo.posts.size).toBe(2); // same posts, no duplicates
    expect(repo.snapshots).toHaveLength(4); // history grows: 2 posts x 2 runs
    expect(new Set(repo.snapshots.map((s) => s.id)).size).toBe(4);
  });

  it('updates an existing post in place and revives a previously deleted one', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValueOnce({ items: [media('m1', { caption: 'old' })], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    const key = `${ACCOUNT_ID}:m1`;
    repo.posts.set(key, { ...repo.posts.get(key)!, deletedAt: new Date() });

    graph.getMedia.mockResolvedValueOnce({ items: [media('m1', { caption: 'edited' })], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);

    expect(repo.posts.get(key)).toMatchObject({ caption: 'edited', deletedAt: null });
  });

  it('stores unknown metrics as null, never 0', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValue({ items: [media('m1', { likeCount: null, commentsCount: null })], nextCursor: null });
    graph.getMediaInsights.mockResolvedValue({ reach: null, views: 0, saves: null, shares: null, profile_visits: null });

    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);

    expect(repo.snapshots[0]).toMatchObject({
      likes: null,
      comments: null,
      reach: null,
      views: 0, // a real zero from Meta stays 0
      saves: null,
      shares: null,
      profileVisits: null,
    });
  });

  it('records the insights Meta returns', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValue({ items: [media('m1')], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    expect(repo.snapshots[0]).toMatchObject({ likes: 5, comments: 1, reach: 100, views: 200, saves: 3, shares: 2, profileVisits: null });
  });

  it('keeps syncing posts when the token cannot read insights, and stops asking', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValue({ items: [media('m1'), media('m2'), media('m3')], nextCursor: null });
    graph.getMediaInsights.mockRejectedValue(new MetaApiError(400, 10, undefined, 'permission denied'));

    const runId = await newRun(repo);
    await service.runMediaSync(ACCOUNT_ID, runId, false);

    expect(graph.getMediaInsights).toHaveBeenCalledTimes(1); // gave up after the first permission error
    expect(repo.runs.get(runId).status).toBe('succeeded');
    expect(repo.snapshots).toHaveLength(3);
    expect(repo.snapshots.every((s) => s.reach === null && s.likes === 5)).toBe(true);
  });

  it('limits per-run insight calls', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValue({ items: [media('a'), media('b'), media('c')], nextCursor: null });
    (service as any).config = new ConfigService({ INSTAGRAM_SYNC_REQUEST_DELAY_MS: '0', INSTAGRAM_SYNC_INSIGHTS_LIMIT: '2' });

    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);

    expect(graph.getMediaInsights).toHaveBeenCalledTimes(2);
    expect(repo.snapshots).toHaveLength(3);
    expect(repo.snapshots[2]).toMatchObject({ reach: null, likes: 5 });
  });

  it('marks posts that disappeared from Instagram (archived or deleted) as removed, after a complete sync', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValueOnce({ items: [media('m1'), media('m2')], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    graph.getMedia.mockResolvedValueOnce({ items: [media('m1')], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    expect(repo.posts.get(`${ACCOUNT_ID}:m1`)!.deletedAt).toBeNull();
    expect(repo.posts.get(`${ACCOUNT_ID}:m2`)!.deletedAt).toBeInstanceOf(Date);
  });

  it('an empty but successful list means every post is gone (archived or deleted)', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValueOnce({ items: [media('m1')], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    graph.getMedia.mockResolvedValueOnce({ items: [], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    expect(repo.posts.get(`${ACCOUNT_ID}:m1`)!.deletedAt).toBeInstanceOf(Date);
  });

  it('brings a post back when it reappears, and never marks anything from a partial (capped) sync', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockResolvedValueOnce({ items: [media('m1'), media('m2')], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    graph.getMedia.mockResolvedValueOnce({ items: [media('m2')], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    expect(repo.posts.get(`${ACCOUNT_ID}:m1`)!.deletedAt).toBeInstanceOf(Date);
    graph.getMedia.mockResolvedValueOnce({ items: [media('m1')], nextCursor: null });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    expect(repo.posts.get(`${ACCOUNT_ID}:m1`)!.deletedAt).toBeNull();

    // A run that stops at the page cap has not seen every post, so nothing may be marked removed.
    (service as any).config = new ConfigService({ INSTAGRAM_SYNC_REQUEST_DELAY_MS: '0', INSTAGRAM_SYNC_MAX_PAGES: '1' });
    graph.getMedia.mockResolvedValueOnce({ items: [media('m9')], nextCursor: 'more' });
    repo.markMissing.mockClear();
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    expect(repo.markMissing).not.toHaveBeenCalled();
    expect(repo.posts.get(`${ACCOUNT_ID}:m1`)!.deletedAt).toBeNull();
  });

  it('stops at the page cap', async () => {
    const { service, repo, graph } = build();
    graph.getMedia.mockImplementation(async (_t: string, _id: string, opts: { after?: string }) => ({
      items: [media(`m-${opts.after ?? 'first'}`)],
      nextCursor: `${opts.after ?? 'first'}+`,
    }));
    (service as any).config = new ConfigService({ INSTAGRAM_SYNC_REQUEST_DELAY_MS: '0', INSTAGRAM_SYNC_MAX_PAGES: '3' });
    await service.runMediaSync(ACCOUNT_ID, await newRun(repo), false);
    expect(graph.getMedia).toHaveBeenCalledTimes(3);
  });

  describe('failures', () => {
    it('rate limit before the last attempt is retried with the run back in the queue', async () => {
      const { service, repo, graph, instagram } = build();
      instagram.withToken.mockRejectedValue(new HttpException('Instagram rate limit reached; retry later', HttpStatus.TOO_MANY_REQUESTS));
      const runId = await newRun(repo);

      await expect(service.runMediaSync(ACCOUNT_ID, runId, false)).rejects.toBeInstanceOf(SyncRetryable);

      expect(repo.runs.get(runId)).toMatchObject({ status: 'queued', errorCode: 'rate_limited' });
      expect(repo.runs.get(runId).finishedAt).toBeNull();
      expect(graph.getMedia).not.toHaveBeenCalled();
    });

    it('marks the run failed once the last attempt is used up', async () => {
      const { service, repo, instagram } = build();
      instagram.withToken.mockRejectedValue(new HttpException('Instagram rate limit reached; retry later', HttpStatus.TOO_MANY_REQUESTS));
      const runId = await newRun(repo);

      await expect(service.runMediaSync(ACCOUNT_ID, runId, true)).rejects.toBeInstanceOf(SyncJobFailed);

      expect(repo.runs.get(runId)).toMatchObject({ status: 'failed', errorCode: 'rate_limited' });
      expect(repo.runs.get(runId).finishedAt).toBeInstanceOf(Date);
    });

    it('does not retry an expired connection', async () => {
      const { service, repo, instagram } = build();
      instagram.withToken.mockRejectedValue(new ConflictException('Instagram connection expired; reconnect the account'));
      const runId = await newRun(repo);

      await expect(service.runMediaSync(ACCOUNT_ID, runId, false)).rejects.toBeInstanceOf(SyncJobFailed);
      expect(repo.runs.get(runId)).toMatchObject({ status: 'failed', errorCode: 'reconnect_required' });
    });

    it('retries Meta outages (5xx)', async () => {
      const { service, repo, graph } = build();
      graph.getMedia.mockRejectedValue(new MetaApiError(503, undefined, undefined, 'down'));
      await expect(service.runMediaSync(ACCOUNT_ID, await newRun(repo), false)).rejects.toBeInstanceOf(SyncRetryable);
    });

    it('fails a run for an account that no longer exists', async () => {
      const { service, repo } = build();
      const runId = await newRun(repo);
      await expect(service.runMediaSync('22222222-2222-4222-8222-222222222222', runId, false)).rejects.toBeInstanceOf(SyncJobFailed);
      expect(repo.runs.get(runId)).toMatchObject({ status: 'failed', errorCode: 'account_not_found' });
    });

    it('never puts the token into run rows or thrown messages', async () => {
      const { service, repo, graph } = build();
      graph.getMedia.mockRejectedValue(new Error(`boom for ${'x'.repeat(5)}`));
      const runId = await newRun(repo);
      const error = await service.runMediaSync(ACCOUNT_ID, runId, true).catch((e: Error) => e);

      expect(JSON.stringify([...repo.runs.values()])).not.toContain(SECRET_TOKEN);
      expect((error as Error).message).not.toContain(SECRET_TOKEN);
    });
  });

  it('refuses to run outside live mode', async () => {
    const { service, repo, graph } = build({ mode: 'mock' });
    const runId = await newRun(repo);
    await expect(service.runMediaSync(ACCOUNT_ID, runId, false)).rejects.toBeInstanceOf(SyncJobFailed);
    expect(graph.getMedia).not.toHaveBeenCalled();
    expect(repo.runs.get(runId).errorCode).toBe('reconnect_required');
  });
});

describe('InstagramSyncService.requestMediaSync', () => {
  it('queues a run for a live, connected account', async () => {
    const { service, queue, repo } = build();
    const { run, alreadyInProgress } = await service.requestMediaSync('user-1', ACCOUNT_ID);
    expect(alreadyInProgress).toBe(false);
    expect(run.status).toBe('queued');
    expect(queue.enqueueMediaSync).toHaveBeenCalledWith({ accountId: ACCOUNT_ID, runId: run.id });
    expect(repo.runs.size).toBe(1);
  });

  it('returns the run in progress instead of queueing a second one', async () => {
    const { service, queue } = build();
    const first = await service.requestMediaSync('user-1', ACCOUNT_ID);
    const second = await service.requestMediaSync('user-1', ACCOUNT_ID);
    expect(second.alreadyInProgress).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    expect(queue.enqueueMediaSync).toHaveBeenCalledTimes(1);
  });

  it('is live-only: mock mode and mock accounts are rejected before anything is queued', async () => {
    const mockMode = build({ mode: 'mock' });
    await expect(mockMode.service.requestMediaSync('user-1', ACCOUNT_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(mockMode.queue.enqueueMediaSync).not.toHaveBeenCalled();

    const mockAccount = build();
    mockAccount.repo.account['isMock'] = true;
    await expect(mockAccount.service.requestMediaSync('user-1', ACCOUNT_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(mockAccount.queue.enqueueMediaSync).not.toHaveBeenCalled();
  });

  it('rejects disconnected or expired accounts', async () => {
    const { service, repo, queue } = build();
    repo.account['status'] = 'expired';
    await expect(service.requestMediaSync('user-1', ACCOUNT_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(queue.enqueueMediaSync).not.toHaveBeenCalled();
  });

  it('is owner-only: an account the caller does not own is a 404', async () => {
    const { service, instagram, queue } = build();
    instagram.owned.mockRejectedValue(new NotFoundException('Instagram account not found'));
    await expect(service.requestMediaSync('someone-else', ACCOUNT_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(queue.enqueueMediaSync).not.toHaveBeenCalled();
  });

  it('marks the run failed when the queue is down', async () => {
    const { service, queue, repo } = build();
    queue.enqueueMediaSync.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.requestMediaSync('user-1', ACCOUNT_ID)).rejects.toThrow('Sync queue unavailable');
    expect([...repo.runs.values()][0]).toMatchObject({ status: 'failed', errorCode: 'queue_unavailable' });
  });
});

describe('parseInstagramTime', () => {
  it('parses Instagram offsets without a colon', () => {
    expect(parseInstagramTime('2026-01-01T10:00:00+0000')?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(parseInstagramTime('2026-01-01T10:00:00+0530')?.toISOString()).toBe('2026-01-01T04:30:00.000Z');
  });
  it('returns null for missing or invalid values', () => {
    expect(parseInstagramTime(null)).toBeNull();
    expect(parseInstagramTime('not a date')).toBeNull();
  });
});
