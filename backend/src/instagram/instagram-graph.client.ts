import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INSTAGRAM_SCOPES, PUBLISH_TIMEOUT_MS, READ_TIMEOUT_MS } from './instagram-graph.constants';
import type {
  GraphJson,
  InstagramBusinessAccount,
  InstagramInsightMetric,
  InstagramMediaItem,
  InstagramMediaPage,
  InstagramMode,
  InstagramProfile,
  LoginFlow,
  LongLivedToken,
  ShortLivedToken,
} from './instagram-graph.types';
import { MetaApiError } from './meta-api.error';

/**
 * Wrapper around the Instagram / Meta Graph API. The publishing calls at the bottom are only ever reached from
 * PublishingService, which checks every gate in AGENTS.md first. Nothing else may call them.
 */
@Injectable()
export class InstagramGraphClient {
  private readonly logger = new Logger(InstagramGraphClient.name);

  constructor(private readonly config: ConfigService) {}

  get mode(): InstagramMode {
    return this.config.get<string>('INSTAGRAM_MODE') === 'live' ? 'live' : 'mock';
  }

  get loginFlow(): LoginFlow {
    return this.config.get<string>('INSTAGRAM_LOGIN_CONFIG_ID') ? 'facebook_login' : 'instagram_login';
  }

  private get version(): string {
    return this.config.get<string>('INSTAGRAM_GRAPH_VERSION') ?? 'v23.0';
  }

  private required(...names: string[]): string {
    for (const name of names) {
      const value = this.config.get<string>(name);
      if (value) return value;
    }
    throw new ServiceUnavailableException(`Instagram integration is not configured (${names[0]})`);
  }

  get appId(): string {
    return this.required('INSTAGRAM_APP_ID', 'META_APP_ID');
  }
  get redirectUri(): string {
    return this.required('INSTAGRAM_REDIRECT_URI', 'META_REDIRECT_URI');
  }
  private get appSecret(): string {
    return this.required('INSTAGRAM_APP_SECRET', 'META_APP_SECRET');
  }
  private get loginConfigId(): string {
    return this.required('INSTAGRAM_LOGIN_CONFIG_ID');
  }

  buildAuthorizationUrl(state: string): string {
    if (this.mode === 'mock') {
      const url = new URL(this.redirectUri);
      url.searchParams.set('code', 'mock-code');
      url.searchParams.set('state', state);
      return url.toString();
    }
    if (this.loginFlow === 'facebook_login') {
      // Mirrors the dashboard's generated login URL; without override_default_response_type the dialog
      // falls into Business Manager asset creation instead of the Instagram-compatible flow.
      const url = new URL('https://www.facebook.com/dialog/oauth');
      url.searchParams.set('client_id', this.appId);
      url.searchParams.set('redirect_uri', this.redirectUri);
      url.searchParams.set('config_id', this.loginConfigId);
      url.searchParams.set('override_default_response_type', 'true');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      return url.toString();
    }
    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', INSTAGRAM_SCOPES.join(','));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<ShortLivedToken> {
    if (this.mode === 'mock') {
      if (code !== 'mock-code') throw new MetaApiError(400, 100, undefined, 'Invalid mock code');
      return { accessToken: 'mock-short-token', userId: 'mock-17841400000000000', permissions: [...INSTAGRAM_SCOPES] };
    }
    if (this.loginFlow === 'facebook_login') {
      const url = this.graphUrl('oauth/access_token');
      url.searchParams.set('client_id', this.appId);
      url.searchParams.set('client_secret', this.appSecret);
      url.searchParams.set('redirect_uri', this.redirectUri);
      url.searchParams.set('code', code);
      const json = await this.request(url);
      return { accessToken: String(json['access_token']), userId: '', permissions: [] };
    }
    const body = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code,
    });
    const json = await this.request('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
    const data: GraphJson = Array.isArray(json['data']) ? json['data'][0] : json;
    const permissions = data['permissions'];
    return {
      accessToken: String(data['access_token']),
      userId: String(data['user_id']),
      permissions: Array.isArray(permissions)
        ? permissions.map(String)
        : typeof permissions === 'string'
          ? permissions.split(',')
          : [],
    };
  }

  async exchangeLongLived(shortToken: string): Promise<LongLivedToken> {
    if (this.mode === 'mock') return { accessToken: 'mock-long-token', expiresInSeconds: 5_184_000 };
    if (this.loginFlow === 'facebook_login') {
      const url = this.graphUrl('oauth/access_token');
      url.searchParams.set('grant_type', 'fb_exchange_token');
      url.searchParams.set('client_id', this.appId);
      url.searchParams.set('client_secret', this.appSecret);
      url.searchParams.set('fb_exchange_token', shortToken);
      const json = await this.request(url);
      return { accessToken: String(json['access_token']), expiresInSeconds: num(json['expires_in']) ?? 5_184_000 };
    }
    const url = new URL('https://graph.instagram.com/access_token');
    url.searchParams.set('grant_type', 'ig_exchange_token');
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('access_token', shortToken);
    const json = await this.request(url);
    return { accessToken: String(json['access_token']), expiresInSeconds: Number(json['expires_in']) };
  }

  /** Instagram Login only. Facebook-login tokens are re-issued by signing in again. */
  async refreshLongLived(token: string): Promise<LongLivedToken> {
    if (this.mode === 'mock') return { accessToken: token, expiresInSeconds: 5_184_000 };
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.searchParams.set('grant_type', 'ig_refresh_token');
    url.searchParams.set('access_token', token);
    const json = await this.request(url);
    return { accessToken: String(json['access_token']), expiresInSeconds: Number(json['expires_in']) };
  }

  /** Facebook-login flow: find the Instagram business account linked to the user's Page(s). */
  async findInstagramAccount(token: string): Promise<InstagramBusinessAccount | null> {
    if (this.mode === 'mock') return { id: 'mock-17841400000000000', username: 'mock_business' };
    let pages: GraphJson[] = [];
    try {
      const json = await this.get(token, 'me/accounts', { fields: 'name,instagram_business_account{id,username}' });
      pages = Array.isArray(json['data']) ? json['data'] : [];
    } catch (error: unknown) {
      // System-user tokens may not expose me/accounts; fall through to the granted-scope lookup.
      if (!(error instanceof MetaApiError)) throw error;
    }
    for (const page of pages) {
      const ig = page['instagram_business_account'] as GraphJson | undefined;
      if (ig?.['id']) return { id: String(ig['id']), username: (ig['username'] as string | undefined) ?? null };
    }
    // Unified-login configs can share the Instagram account directly (no Page); its id is on the granted scope.
    const debug = this.graphUrl('debug_token');
    debug.searchParams.set('input_token', token);
    debug.searchParams.set('access_token', `${this.appId}|${this.appSecret}`);
    const info = ((await this.request(debug))['data'] ?? {}) as GraphJson;
    const scopes: GraphJson[] = Array.isArray(info['granular_scopes']) ? info['granular_scopes'] : [];
    const targetIds = [
      ...new Set(
        scopes
          .filter((s) => String(s['scope']).startsWith('instagram_'))
          .flatMap((s) => (Array.isArray(s['target_ids']) ? s['target_ids'].map(String) : [])),
      ),
    ];
    this.logger.log({
      event: 'instagram_account_lookup',
      pages: pages.length,
      tokenType: info['type'],
      scopes: scopes.map((s) => s['scope']),
      instagramTargets: targetIds.length,
    });
    return targetIds.length ? { id: String(targetIds[0]), username: null } : null;
  }

  /** igId is the Instagram user id, or 'me' during the first connect for instagram_login. */
  async getProfile(token: string, igId = 'me'): Promise<InstagramProfile> {
    if (this.mode === 'mock') {
      return {
        id: 'mock-17841400000000000',
        username: 'mock_business',
        name: 'Mock Business',
        accountType: 'BUSINESS',
        profilePictureUrl: null,
        followersCount: 1234,
        followsCount: 321,
        mediaCount: 42,
      };
    }
    const facebook = !isInstagramToken(token);
    const json = await this.get(token, igId, {
      fields: facebook
        ? 'id,username,name,profile_picture_url,followers_count,follows_count,media_count'
        : 'user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count',
    });
    return {
      id: String(json['user_id'] ?? json['id']),
      username: String(json['username']),
      name: (json['name'] as string | undefined) ?? null,
      accountType: facebook ? 'BUSINESS' : ((json['account_type'] as string | undefined) ?? null),
      profilePictureUrl: (json['profile_picture_url'] as string | undefined) ?? null,
      followersCount: num(json['followers_count']),
      followsCount: num(json['follows_count']),
      mediaCount: num(json['media_count']),
    };
  }

  async getMedia(token: string, igId: string, opts: { limit: number; after?: string }): Promise<InstagramMediaPage> {
    if (this.mode === 'mock') {
      return {
        items: [
          {
            id: 'mock-media-1',
            caption: 'Mock post',
            mediaType: 'IMAGE',
            mediaProductType: 'FEED',
            permalink: 'https://www.instagram.com/p/mock/',
            thumbnailUrl: null,
            mediaUrl: null,
            timestamp: '2026-01-01T00:00:00+0000',
            likeCount: 10,
            commentsCount: 2,
          },
        ],
        nextCursor: null,
      };
    }
    const params: Record<string, string> = {
      fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
      limit: String(opts.limit),
    };
    if (opts.after) params['after'] = opts.after;
    const json = await this.get(token, `${igId}/media`, params);
    const data: GraphJson[] = Array.isArray(json['data']) ? json['data'] : [];
    return {
      items: data.map((m) => ({
        id: String(m['id']),
        caption: (m['caption'] as string | undefined) ?? null,
        mediaType: (m['media_type'] as string | undefined) ?? null,
        mediaProductType: (m['media_product_type'] as string | undefined) ?? null,
        permalink: (m['permalink'] as string | undefined) ?? null,
        thumbnailUrl: (m['thumbnail_url'] as string | undefined) ?? null,
        mediaUrl: (m['media_url'] as string | undefined) ?? null,
        timestamp: (m['timestamp'] as string | undefined) ?? null,
        likeCount: num(m['like_count']),
        commentsCount: num(m['comments_count']),
      })),
      nextCursor: (json['paging']?.['cursors']?.['after'] as string | undefined) ?? null,
    };
  }

  async getInsights(
    token: string,
    igId: string,
    opts: { metrics: string[]; since: number; until: number },
  ): Promise<InstagramInsightMetric[]> {
    if (this.mode === 'mock') {
      return opts.metrics.map((name) => ({ name, title: name, value: 100 }));
    }
    const json = await this.get(token, `${igId}/insights`, {
      metric: opts.metrics.join(','),
      period: 'day',
      metric_type: 'total_value',
      since: String(opts.since),
      until: String(opts.until),
    });
    const data: GraphJson[] = Array.isArray(json['data']) ? json['data'] : [];
    return data.map((m) => ({
      name: String(m['name']),
      title: (m['title'] as string | undefined) ?? null,
      value: num(m['total_value']?.['value']),
    }));
  }

  /**
   * Insights for one media item. A metric the media type does not support (or that Meta withholds)
   * comes back as null = unknown, never 0. Mock mode returns all-null: sync never fabricates metrics.
   */
  async getMediaInsights(
    token: string,
    mediaId: string,
    metrics: readonly string[],
  ): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = Object.fromEntries(metrics.map((name) => [name, null]));
    if (this.mode === 'mock') return result;

    const read = async (names: string[]) => {
      const json = await this.get(token, `${mediaId}/insights`, { metric: names.join(',') });
      for (const m of Array.isArray(json['data']) ? (json['data'] as GraphJson[]) : []) {
        result[String(m['name'])] = num(m['values']?.[0]?.['value'] ?? m['total_value']?.['value']);
      }
    };
    try {
      await read([...metrics]);
    } catch (error) {
      // Code 100 = invalid parameter, e.g. one metric unsupported for this media type, which fails the
      // whole request. Retry one at a time so the supported metrics still come through.
      if (!(error instanceof MetaApiError) || error.code !== 100) throw error;
      for (const name of metrics) {
        try {
          await read([name]);
        } catch (single) {
          if (!(single instanceof MetaApiError) || single.code !== 100) throw single;
        }
      }
    }
    return result;
  }

  // ---------- publishing (called only by PublishingService) ----------

  /** Step 1: Instagram downloads the picture and prepares it. Returns the container id. */
  async createImageContainer(token: string, igId: string, p: { imageUrl: string; caption?: string; carouselItem?: boolean }): Promise<string> {
    const params: Record<string, string> = { image_url: p.imageUrl };
    if (p.carouselItem) params['is_carousel_item'] = 'true';
    if (p.caption) params['caption'] = p.caption;
    return String((await this.post(token, `${igId}/media`, params))['id']);
  }

  /** A Reel: Instagram downloads the MP4 and prepares it. Also shown in the feed. Returns the container id. */
  async createReelContainer(token: string, igId: string, p: { videoUrl: string; caption: string }): Promise<string> {
    const params: Record<string, string> = { media_type: 'REELS', video_url: p.videoUrl, caption: p.caption, share_to_feed: 'true' };
    return String((await this.post(token, `${igId}/media`, params))['id']);
  }

  /** Step 2 (carousels only): ties 2 to 10 prepared pictures together. */
  async createCarouselContainer(token: string, igId: string, children: string[], caption: string): Promise<string> {
    return String((await this.post(token, `${igId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }))['id']);
  }

  /** IN_PROGRESS, FINISHED, ERROR, EXPIRED or PUBLISHED. */
  async containerStatus(token: string, containerId: string): Promise<string> {
    return String((await this.get(token, containerId, { fields: 'status_code' }))['status_code'] ?? 'UNKNOWN');
  }

  /** Final step: makes the prepared post public. Returns the Instagram media id. */
  async publishContainer(token: string, igId: string, creationId: string): Promise<string> {
    return String((await this.post(token, `${igId}/media_publish`, { creation_id: creationId }))['id']);
  }

  /** The public link of a published media item. Read-only. */
  async getMediaPermalink(token: string, mediaId: string): Promise<string | null> {
    if (this.mode === 'mock') return 'https://www.instagram.com/reel/mock/';
    const json = await this.get(token, mediaId, { fields: 'permalink' });
    return (json['permalink'] as string | undefined) ?? null;
  }

  private post(token: string, path: string, params: Record<string, string>): Promise<GraphJson> {
    const base = isInstagramToken(token) ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
    const body = new URLSearchParams({ ...params, access_token: token }); // token in the body, never in the URL
    // Meta downloads the image during the container call, which can take far longer than a read.
    return this.request(
      `${base}/${this.version}/${path}`,
      { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } },
      PUBLISH_TIMEOUT_MS,
    );
  }

  private graphUrl(path: string): URL {
    return new URL(`https://graph.facebook.com/${this.version}/${path}`);
  }

  private get(token: string, path: string, params: Record<string, string>): Promise<GraphJson> {
    const base = isInstagramToken(token) ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
    const url = new URL(`${base}/${this.version}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('access_token', token);
    return this.request(url);
  }

  private async request(url: URL | string, init: RequestInit = {}, timeoutMs = READ_TIMEOUT_MS): Promise<GraphJson> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // Never log the URL: it can contain an access token or client secret.
      throw new MetaApiError(504, undefined, undefined, `Network error or timeout (${timeoutMs / 1000}s) calling Instagram`);
    }
    let json: GraphJson = {};
    try {
      json = (await response.json()) as GraphJson;
    } catch {
      /* non-JSON body */
    }
    if (!response.ok || json['error'] || json['error_type']) {
      const err = (json['error'] ?? json) as GraphJson;
      const message = String(err['message'] ?? err['error_message'] ?? 'Unknown Instagram error');
      this.logger.warn({ event: 'instagram_api_error', status: response.status, code: err['code'], message });
      throw new MetaApiError(response.status, num(err['code']) ?? undefined, num(err['error_subcode']) ?? undefined, message);
    }
    return json;
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Instagram Login tokens start with "IG"; Facebook/unified-login tokens (EAA…) use graph.facebook.com. */
export function isInstagramToken(token: string): boolean {
  return token.startsWith('IG');
}
