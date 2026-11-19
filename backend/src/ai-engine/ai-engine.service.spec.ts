import { BadGatewayException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiEngineError } from './ai-engine.client';
import type { AiEngineClient } from './ai-engine.client';
import { engineProfileId, toEnginePosts, toEngineProfile } from './ai-engine.mapper';
import { AiEngineService } from './ai-engine.service';
import type { AiEngineSourceRepository } from './ai-engine-source.repository';
import type { BusinessFacts, PostFacts } from './ai-engine.types';

const OWNER = '11111111-1111-4111-8111-111111111111';
const BIZ: BusinessFacts = { id: 'b0000000-0000-4000-8000-000000000001', name: 'Rang Boutique', category: 'clothing', description: null, city: 'Mumbai', area: null, targetAudience: null, preferredLanguage: 'hi', primaryGoal: 'More sales' };
const POST: PostFacts = { platformMediaId: 'm1', mediaType: 'IMAGE', mediaProductType: 'FEED', caption: 'hi', permalink: null, publishedAt: new Date('2026-10-01T10:00:00Z'), metrics: { views: null, reach: 100, likes: 0, comments: 2, saves: null, shares: null }, followerCount: 500 };

function build(opts: { enabled?: boolean; business?: BusinessFacts | null; posts?: PostFacts[]; accountMock?: boolean } = {}) {
  const calls: Array<Record<string, any>> = [];
  const engine = {
    enabled: opts.enabled ?? true,
    config: { generateTimeoutMs: 60_000, maxPosts: 200 },
    call: jest.fn(async (req: Record<string, any>) => {
      calls.push(req);
      return { ok: true, path: req.path };
    }),
    isHealthy: jest.fn(async () => true),
  };
  const source = {
    findBusinessForUser: jest.fn(async (userId: string) => (userId === OWNER ? (opts.business === undefined ? BIZ : opts.business) : null)),
    findInstagramAccount: jest.fn(async () => ({ id: 'acc1', username: 'rang.boutique', isMock: opts.accountMock ?? false, status: 'connected' })),
    productNames: jest.fn(async () => ['Cotton kurti']),
    followerCount: jest.fn(async () => 500),
    recentPosts: jest.fn(async () => opts.posts ?? [POST]),
  };
  return { service: new AiEngineService(engine as unknown as AiEngineClient, source as unknown as AiEngineSourceRepository), engine, source, calls };
}

describe('AiEngineService', () => {
  it('loads mock data under an owner-derived industry profile without touching the live profile', async () => {
    const { service, calls, source } = build();
    await service.mockOverview(OWNER, 'req-12345678', { industry: 'fashion' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/profiles/mock_${BIZ.id}_fashion/preview`, body: { industry: 'fashion', regenerate: false } });
    expect(source.findInstagramAccount).not.toHaveBeenCalled();
    await service.mockFeedback(OWNER, 'req-12345678', 'rec_abc123', { industry: 'beauty', action: 'SAVED' });
    expect(calls[1].body).toMatchObject({ profile_id: `mock_${BIZ.id}_beauty`, action: 'SAVED' });
  });

  it('rejects mock calls without an owned business or when the engine is disabled', async () => {
    const missing = build({ business: null });
    await expect(missing.service.mockOverview(OWNER, 'req-12345678', { industry: 'cafe' })).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.engine.call).not.toHaveBeenCalled();
    const disabled = build({ enabled: false });
    await expect(disabled.service.mockOverview(OWNER, 'req-12345678', { industry: 'grooming' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(disabled.engine.call).not.toHaveBeenCalled();
  });

  it('is a 503 with a clear code when the feature is off, and touches nothing', async () => {
    const { service, engine, source } = build({ enabled: false });
    await expect(service.generate(OWNER, 'req-12345678', {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(engine.call).not.toHaveBeenCalled();
    expect(source.findBusinessForUser).not.toHaveBeenCalled();
    await expect(service.status('req-12345678')).resolves.toEqual({ enabled: false, available: false });
  });

  it('derives the business from the signed-in user: a user with no business gets 404 and nothing is sent', async () => {
    const { service, engine } = build();
    await expect(service.generate('99999999-9999-4999-8999-999999999999', 'req-12345678', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(engine.call).not.toHaveBeenCalled();
  });

  it('syncs the profile, sends posts for analysis, then generates, always for the derived profile id', async () => {
    const { service, calls } = build();
    const result = await service.generate(OWNER, 'req-12345678', { count: 5, useAi: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`PUT /profiles/biz_${BIZ.id}`, 'POST /analytics/analyze', 'POST /recommendations/generate']);
    expect(calls[2].body).toEqual({ profile_id: `biz_${BIZ.id}`, count: 5, goal: undefined, use_ai: true });
    expect(calls[2].timeoutMs).toBe(60_000);
    expect(calls[2].idempotent).toBeUndefined(); // generating saves results: never repeated automatically
    expect(calls.every((c) => c.requestId === 'req-12345678')).toBe(true);
    expect(result.context).toEqual({ instagramConnected: true, mockAccount: false, postsSent: 1 });
  });

  it('skips the analysis call when there are no posts, and says the account is a mock one', async () => {
    const { service, calls } = build({ posts: [], accountMock: true });
    const result = await service.generate(OWNER, 'req-12345678', {});
    expect(calls.map((c) => c.path)).not.toContain('/analytics/analyze');
    expect(result.context).toMatchObject({ mockAccount: true, postsSent: 0 });
  });

  it('refuses an analysis with no posts', async () => {
    const { service } = build({ posts: [] });
    await expect(service.analysis(OWNER, 'req-12345678')).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['unreachable', ServiceUnavailableException],
    ['timeout', ServiceUnavailableException],
    ['circuit_open', ServiceUnavailableException],
    ['unauthorized', ServiceUnavailableException],
    ['not_found', NotFoundException],
    ['conflict', ConflictException],
    ['ai_provider', BadGatewayException],
  ] as const)('turns an engine %s failure into the right HTTP error', async (kind, expected) => {
    const { service, engine } = build();
    engine.call.mockImplementation(async (req: Record<string, any>) => {
      if (req.path === '/audience/insights') throw new AiEngineError(kind, 'm');
      return {};
    });
    await expect(service.audience(OWNER, 'req-12345678')).rejects.toBeInstanceOf(expected);
  });

  it('does not leak internals in the 503 body', async () => {
    const { service, engine } = build();
    engine.call.mockRejectedValue(new AiEngineError('unreachable', 'connect ECONNREFUSED 10.0.0.5:8001'));
    const error = (await service.trends(OWNER, 'req-12345678').catch((e: unknown) => e)) as ServiceUnavailableException;
    expect(JSON.stringify(error.getResponse())).not.toMatch(/10\.0\.0\.5|ECONNREFUSED/);
  });

  it('sends the derived profile id with feedback and outcomes, and rejects an unsafe recommendation id', async () => {
    const { service, calls } = build();
    await service.feedback(OWNER, 'req-12345678', 'rec_abc123', { action: 'SAVED' });
    await service.recordOutcome(OWNER, 'req-12345678', 'rec_abc123', { interval: 'H24', metrics: { reach: 10 } });
    expect(calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body.profile_id])).toEqual([
      ['/recommendations/rec_abc123/feedback', `biz_${BIZ.id}`],
      ['/recommendations/rec_abc123/outcomes', `biz_${BIZ.id}`],
    ]);
    await expect(service.feedback(OWNER, 'req-12345678', '../../profiles/x', { action: 'SAVED' })).rejects.toThrow('Invalid recommendation id');
  });

  it('reports status without throwing when the engine is down', async () => {
    const { service, engine } = build();
    engine.isHealthy.mockResolvedValue(false);
    await expect(service.status('req-12345678')).resolves.toEqual({ enabled: true, available: false });
  });
});

describe('mapper', () => {
  it('derives the engine profile id from the business id only', () => {
    expect(engineProfileId(BIZ.id)).toBe(`biz_${BIZ.id}`);
  });

  it('maps the business without inventing data', () => {
    const p = toEngineProfile(BIZ, 'rang.boutique', ['Cotton kurti', ' ']);
    expect(p).toMatchObject({ profile_type: 'BUSINESS', category: 'clothing', city: 'Mumbai', primary_language: 'hi', goals: ['SALES'], instagram_username: 'rang.boutique', products: ['Cotton kurti'] });
    expect(toEngineProfile({ ...BIZ, category: 'other', primaryGoal: null }, 'bad name!', [])).toMatchObject({ category: null, goals: [], instagram_username: null });
  });

  it('keeps unknown metrics null and real zeros as zero', () => {
    const [post] = toEnginePosts([POST]);
    expect(post).toMatchObject({ media_id: 'm1', views: null, saves: null, likes: 0, reach: 100, posted_at: '2026-10-01T10:00:00.000Z' });
    expect(toEnginePosts([{ ...POST, metrics: null }])[0]).toMatchObject({ likes: null, reach: null });
  });
});
