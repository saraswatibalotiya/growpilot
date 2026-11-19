import { BadGatewayException, BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiEngineClient, AiEngineError } from './ai-engine.client';
import { MOCK_INDUSTRIES, type FeedbackDto, type GenerateRecommendationsDto, type MockFeedbackDto, type MockPreviewDto, type OutcomeDto } from './ai-engine.dto';
import { engineProfileId, toEnginePosts, toEngineProfile } from './ai-engine.mapper';
import { AiEngineSourceRepository } from './ai-engine-source.repository';
import type { DataContext, EngineSourceData } from './ai-engine.types';

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Connects the signed-in owner's business to the Python AI engine. Every call starts from the user id in the verified
 * access token: the business, and therefore the engine profile, is looked up from it and never taken from the request.
 * Nothing here changes existing data, and nothing outside this module depends on it.
 */
@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);

  constructor(
    private readonly engine: AiEngineClient,
    private readonly source: AiEngineSourceRepository,
  ) {}

  /** Never throws: the frontend uses this to decide whether to show the AI features. */
  async status(requestId: string) {
    if (!this.engine.enabled) return { enabled: false, available: false };
    return { enabled: true, available: await this.engine.isHealthy(requestId) };
  }

  async mockOverview(userId: string, requestId: string, dto: MockPreviewDto) {
    const profileId = await this.mockProfileId(userId, dto.industry);
    return this.run(() => this.engine.call({
      method: 'POST', path: `/profiles/${profileId}/preview`,
      body: { industry: dto.industry, regenerate: dto.regenerate ?? false }, requestId,
      timeoutMs: this.engine.config.generateTimeoutMs,
    }));
  }

  async mockFeedback(userId: string, requestId: string, id: string, dto: MockFeedbackDto) {
    this.assertId(id);
    const profileId = await this.mockProfileId(userId, dto.industry);
    return this.run(() => this.engine.call({
      method: 'POST', path: `/recommendations/${id}/feedback`,
      body: { profile_id: profileId, action: dto.action, comment: dto.comment }, requestId,
    }));
  }

  private async mockProfileId(userId: string, industry: MockPreviewDto['industry']): Promise<string> {
    if (!MOCK_INDUSTRIES.includes(industry)) throw new BadRequestException('Unknown mock business.');
    if (!this.engine.enabled) throw new ServiceUnavailableException('AI insights are not turned on.');
    const business = await this.source.findBusinessForUser(userId);
    if (!business) throw new NotFoundException('Create your business profile first.');
    return `mock_${business.id}_${industry}`;
  }

  async analysis(userId: string, requestId: string) {
    const { profileId, data } = await this.prepare(userId, requestId);
    if (data.posts.length === 0) throw new ConflictException({ code: 'AI_NO_POSTS', message: 'Connect Instagram and let your posts sync before running an analysis.' });
    const report = await this.run(() => this.analyze(profileId, data, requestId));
    return { analysis: report, context: this.context(data) };
  }

  async generate(userId: string, requestId: string, dto: GenerateRecommendationsDto) {
    const { profileId, data } = await this.prepare(userId, requestId);
    if (data.posts.length > 0) await this.run(() => this.analyze(profileId, data, requestId));
    const result = await this.run(() =>
      this.engine.call<Record<string, unknown>>({
        method: 'POST',
        path: '/recommendations/generate',
        body: { profile_id: profileId, count: dto.count ?? 4, goal: dto.goal, use_ai: dto.useAi ?? false },
        requestId,
        timeoutMs: this.engine.config.generateTimeoutMs,
      }),
    );
    return { ...result, context: this.context(data) };
  }

  async listRecommendations(userId: string, requestId: string, page: number, pageSize: number) {
    const { profileId } = await this.prepare(userId, requestId);
    return this.run(() => this.engine.call({ method: 'GET', path: '/recommendations', query: { profile_id: profileId, page, page_size: pageSize }, requestId, idempotent: true }));
  }

  async audience(userId: string, requestId: string) {
    const { profileId } = await this.prepare(userId, requestId);
    return this.run(() => this.engine.call({ method: 'GET', path: '/audience/insights', query: { profile_id: profileId }, requestId, idempotent: true }));
  }

  async competitors(userId: string, requestId: string) {
    const { profileId } = await this.prepare(userId, requestId);
    return this.run(() => this.engine.call({ method: 'GET', path: '/competitors', query: { profile_id: profileId }, requestId, idempotent: true }));
  }

  async trends(userId: string, requestId: string) {
    const { profileId } = await this.prepare(userId, requestId);
    return this.run(() => this.engine.call({ method: 'POST', path: '/trends/analyze', body: { profile_id: profileId }, requestId, idempotent: true }));
  }

  async learning(userId: string, requestId: string) {
    const { profileId } = await this.prepare(userId, requestId);
    return this.run(() => this.engine.call({ method: 'GET', path: '/learning', query: { profile_id: profileId }, requestId, idempotent: true }));
  }

  async feedback(userId: string, requestId: string, recommendationId: string, dto: FeedbackDto) {
    this.assertId(recommendationId);
    const { profileId } = await this.prepare(userId, requestId);
    return this.run(() => this.engine.call({ method: 'POST', path: `/recommendations/${recommendationId}/feedback`, body: { profile_id: profileId, action: dto.action, comment: dto.comment }, requestId }));
  }

  async recordOutcome(userId: string, requestId: string, recommendationId: string, dto: OutcomeDto) {
    this.assertId(recommendationId);
    const { profileId } = await this.prepare(userId, requestId);
    const body = { profile_id: profileId, interval: dto.interval, instagram_media_id: dto.instagramMediaId, captured_at: dto.capturedAt, metrics: dto.metrics };
    return this.run(() => this.engine.call({ method: 'POST', path: `/recommendations/${recommendationId}/outcomes`, body, requestId }));
  }

  // ---- internals ----

  /** Turned-off check, then the owner's business and the engine copy of its profile. */
  private async prepare(userId: string, requestId: string): Promise<{ profileId: string; data: EngineSourceData }> {
    if (!this.engine.enabled) throw new ServiceUnavailableException({ code: 'AI_ENGINE_DISABLED', message: 'AI insights are not turned on.' });
    const business = await this.source.findBusinessForUser(userId);
    if (!business) throw new NotFoundException('Create your business profile first.');
    const account = await this.source.findInstagramAccount(business.id);
    const usable = account !== null && account.status === 'connected';
    const [productNames, followers] = await Promise.all([this.source.productNames(business.id, 40), usable ? this.source.followerCount(account.id) : Promise.resolve(null)]);
    const posts = usable ? await this.source.recentPosts(account.id, followers, this.engine.config.maxPosts) : [];
    const data: EngineSourceData = { business, account, posts, productNames };

    const profileId = engineProfileId(business.id);
    await this.run(() => this.engine.call({ method: 'PUT', path: `/profiles/${profileId}`, body: toEngineProfile(business, account?.username ?? null, productNames), requestId, idempotent: true }));
    return { profileId, data };
  }

  private analyze(profileId: string, data: EngineSourceData, requestId: string) {
    return this.engine.call<Record<string, unknown>>({
      method: 'POST',
      path: '/analytics/analyze',
      body: { profile_id: profileId, posts: toEnginePosts(data.posts), replace: true },
      requestId,
      idempotent: true, // replace=true: sending it twice leaves the same state
    });
  }

  private context(data: EngineSourceData): DataContext {
    return { instagramConnected: data.account?.status === 'connected', mockAccount: data.account?.isMock ?? false, postsSent: data.posts.length };
  }

  private assertId(id: string): void {
    if (!ID.test(id)) throw new BadRequestException('Invalid recommendation id.');
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AiEngineError) throw this.toHttp(error);
      throw error;
    }
  }

  private toHttp(error: AiEngineError) {
    switch (error.kind) {
      case 'not_found':
        return new NotFoundException(error.message);
      case 'conflict':
        return new ConflictException({ code: 'AI_NEEDS_MORE_DATA', message: error.message });
      case 'ai_provider':
        return new BadGatewayException({ code: 'AI_WORDING_FAILED', message: error.message });
      case 'disabled':
        return new ServiceUnavailableException({ code: 'AI_ENGINE_DISABLED', message: 'AI insights are not turned on.' });
      default:
        // A rejected token or a rejected request is our configuration or a bug, not something the user can fix: log it, say little.
        if (error.kind === 'unauthorized' || error.kind === 'invalid_request' || error.kind === 'bad_response') this.logger.error(`AI engine call failed: ${error.kind} (${error.status ?? '-'}, ${error.engineCode ?? '-'})`);
        return new ServiceUnavailableException({ code: 'AI_ENGINE_UNAVAILABLE', message: 'AI insights are temporarily unavailable. The rest of GrowPilot is not affected.' });
    }
  }
}
