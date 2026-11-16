import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramGraphClient, isInstagramToken } from './instagram-graph.client';
import type { InstagramProfile } from './instagram-graph.types';
import { InstagramStateService, StateReplayedError } from './instagram-state.service';
import { InstagramRepository } from './instagram.repository';
import { MetaApiError } from './meta-api.error';
import { TokenEncryptionService } from './token-encryption.service';

const ELIGIBLE_ACCOUNT_TYPES = ['BUSINESS', 'MEDIA_CREATOR'];
const REFRESH_WINDOW_MS = 7 * 24 * 3600 * 1000;

type CallbackErrorCode =
  | 'denied'
  | 'invalid_state'
  | 'unsupported_account_type'
  | 'not_allowlisted'
  | 'account_in_use'
  | 'business_already_connected'
  | 'no_instagram_account'
  | 'instagram_error'
  | 'internal';

class ConnectFailure extends Error {
  constructor(readonly code: CallbackErrorCode) {
    super(code);
  }
}

export type OwnedAccount = NonNullable<Awaited<ReturnType<InstagramRepository['findOwnedAccount']>>>;

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly graph: InstagramGraphClient,
    private readonly state: InstagramStateService,
    private readonly repository: InstagramRepository,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
  ) {}

  // ---------- OAuth ----------

  async createAuthorizationUrl(userId: string, businessId: string) {
    if (!(await this.repository.findOwnedBusiness(userId, businessId))) {
      throw new NotFoundException('Business not found');
    }
    const state = await this.state.sign({ userId, businessId });
    return { authorizationUrl: this.graph.buildAuthorizationUrl(state), mode: this.graph.mode };
  }

  /** Handles Meta's redirect. Never throws: always returns a frontend URL carrying the outcome. */
  async handleCallback(query: { code?: string; state?: string; error?: string }): Promise<string> {
    try {
      if (query.error) throw new ConnectFailure('denied');
      if (!query.code || !query.state) throw new ConnectFailure('invalid_state');
      const { userId, businessId } = await this.state.verify(query.state).catch((error: unknown) => {
        if (error instanceof StateReplayedError || error instanceof BadRequestException) {
          throw new ConnectFailure('invalid_state');
        }
        throw error;
      });
      if (!(await this.repository.findOwnedBusiness(userId, businessId))) {
        throw new ConnectFailure('invalid_state');
      }

      const short = await this.graph.exchangeCode(query.code);
      const long = await this.graph.exchangeLongLived(short.accessToken);
      // Facebook-login flow: the Instagram account comes from the user's linked Page(s).
      let igAccountId = 'me';
      if (this.graph.loginFlow === 'facebook_login') {
        const found = await this.graph.findInstagramAccount(long.accessToken);
        if (!found) throw new ConnectFailure('no_instagram_account');
        igAccountId = found.id;
      }
      const fetched = await this.graph.getProfile(long.accessToken, igAccountId);
      // Mock mode: give each business its own fake account id so several businesses can be tested.
      const profile = this.graph.mode === 'mock' ? { ...fetched, id: `mock-${businessId}` } : fetched;
      await this.saveConnection(userId, businessId, profile, {
        accessToken: long.accessToken,
        expiresAt: new Date(Date.now() + long.expiresInSeconds * 1000),
        permissions: short.permissions,
      });
      return this.frontendUrl({ status: 'success' });
    } catch (error: unknown) {
      const code: CallbackErrorCode =
        error instanceof ConnectFailure ? error.code : error instanceof MetaApiError ? 'instagram_error' : 'internal';
      if (code === 'internal' || code === 'instagram_error') {
        this.logger.error({ event: 'instagram_connect_failed', code, message: (error as Error).message });
      }
      return this.frontendUrl({ status: 'error', code });
    }
  }

  /** Test-mode only: connect with an Instagram user token generated in the Meta dashboard. */
  async connectWithToken(userId: string, businessId: string, accessToken: string, instagramAccountId?: string) {
    if (this.config.get<string>('ENABLE_TEST_MODE') !== 'true') {
      throw new ForbiddenException('Token connect is only available when ENABLE_TEST_MODE=true');
    }
    if (!(await this.repository.findOwnedBusiness(userId, businessId))) {
      throw new NotFoundException('Business not found');
    }
    try {
      let igId = 'me';
      if (instagramAccountId) {
        // Not trusted on its own: getProfile below only succeeds if the token can read this account.
        igId = instagramAccountId;
      } else if (!isInstagramToken(accessToken)) {
        const found = await this.graph.findInstagramAccount(accessToken);
        if (!found) throw new ConnectFailure('no_instagram_account');
        igId = found.id;
      }
      const profile = await this.graph.getProfile(accessToken, igId);
      await this.saveConnection(userId, businessId, profile, {
        accessToken,
        expiresAt: null,
        permissions: [],
        source: 'dashboard',
      });
    } catch (error: unknown) {
      if (error instanceof ConnectFailure) {
        const message = this.describeResult('error', error.code).message;
        throw error.code === 'account_in_use' || error.code === 'business_already_connected'
          ? new ConflictException(message)
          : new ForbiddenException(message);
      }
      if (error instanceof MetaApiError) {
        throw new BadRequestException(`Instagram rejected the token: ${error.message}`);
      }
      throw error;
    }
    return this.listAccounts(userId, businessId);
  }

  private async saveConnection(
    userId: string,
    businessId: string,
    profile: InstagramProfile,
    token: { accessToken: string; expiresAt: Date | null; permissions: string[]; source?: 'oauth' | 'dashboard' },
  ) {
    this.assertEligible(profile);
    const data = {
      businessId,
      platformAccountId: profile.id,
      username: profile.username,
      displayName: profile.name,
      accountType: profile.accountType,
      permissionsJson: token.permissions,
      isMock: this.graph.mode === 'mock',
      lastSyncedAt: new Date(),
      accessTokenEncrypted: this.encryption.encrypt(token.accessToken),
      tokenExpiresAt: token.expiresAt,
      tokenSource: token.source ?? 'oauth',
      followerCount: profile.followersCount,
      postCount: profile.mediaCount,
      status: 'connected' as const,
    };
    const existing = await this.repository.findByPlatformAccountId(profile.id);
    if (existing && existing.businessId !== businessId) throw new ConnectFailure('account_in_use');
    const forBusiness = await this.repository.findByBusiness(businessId);
    if (forBusiness && forBusiness.platformAccountId !== profile.id) {
      throw new ConnectFailure('business_already_connected');
    }
    const saved = existing
      ? await this.repository.update(existing.id, data)
      : await this.repository.create(randomUUID(), data);
    this.logger.log({ event: 'instagram_connected', userId, businessId, accountId: saved?.id, mode: this.graph.mode });
  }

  private assertEligible(profile: InstagramProfile) {
    if (!profile.accountType || !ELIGIBLE_ACCOUNT_TYPES.includes(profile.accountType)) {
      throw new ConnectFailure('unsupported_account_type');
    }
    if (this.graph.mode === 'live') {
      // Live mode is restricted to an explicit allowlist (ids or usernames). Empty list = nobody.
      const allow = (this.config.get<string>('INSTAGRAM_LIVE_ALLOWLIST') ?? '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      if (!allow.includes(profile.id.toLowerCase()) && !allow.includes(profile.username.toLowerCase())) {
        throw new ConnectFailure('not_allowlisted');
      }
    }
  }

  /** True when this exact account (id or username) is on INSTAGRAM_LIVE_ALLOWLIST. Empty list = nobody. */
  isAllowlisted(account: { platformAccountId: string; username: string | null }): boolean {
    const allow = (this.config.get<string>('INSTAGRAM_LIVE_ALLOWLIST') ?? '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    return allow.includes(account.platformAccountId.toLowerCase()) || (!!account.username && allow.includes(account.username.toLowerCase()));
  }

  private frontendUrl(params: Record<string, string>): string {
    const frontend = this.config.get<string>('FRONTEND_URL');
    // Without a frontend, land on the backend's own result page on the same host as the callback.
    const url = frontend
      ? new URL('/connect/instagram', frontend)
      : new URL('/integrations/instagram/result', this.graph.redirectUri);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }

  describeResult(status?: string, code?: string) {
    if (status === 'success') return { status: 'success', message: 'Instagram account connected and saved.' };
    const reasons: Record<CallbackErrorCode, string> = {
      denied: 'You cancelled or declined the Meta permission dialog.',
      invalid_state: 'The login link expired or was already used. Request a new link from GET /integrations/instagram/connect.',
      unsupported_account_type: 'The Instagram account must be a Business or Creator account.',
      not_allowlisted: 'This Instagram account is not in INSTAGRAM_LIVE_ALLOWLIST.',
      account_in_use: 'This Instagram account is already connected to another business.',
      business_already_connected: 'This business already has a different Instagram account connected.',
      no_instagram_account:
        'No Instagram Business/Creator account was found on the Facebook Pages you shared. Link the Instagram account to a Facebook Page and select that Page in the Meta dialog.',
      instagram_error: 'Meta rejected a request. Check the backend log line "instagram_api_error" for the exact message.',
      internal: 'Unexpected server error. Check the backend log line "instagram_connect_failed".',
    };
    return { status: 'error', code, message: reasons[code as CallbackErrorCode] ?? 'Unknown result.' };
  }

  // ---------- Accounts ----------

  async listAccounts(userId: string, businessId: string) {
    if (!(await this.repository.findOwnedBusiness(userId, businessId))) {
      throw new NotFoundException('Business not found');
    }
    return this.repository.listForBusiness(businessId);
  }

  async getAccount(userId: string, accountId: string) {
    return this.toSafe(await this.owned(userId, accountId));
  }

  async syncProfile(userId: string, accountId: string) {
    const account = await this.owned(userId, accountId);
    const profile = await this.withToken(account, (token) => this.graph.getProfile(token, account.platformAccountId));
    return this.repository.update(account.id, {
      username: profile.username,
      displayName: profile.name,
      accountType: profile.accountType,
      followerCount: profile.followersCount,
      postCount: profile.mediaCount,
      lastSyncedAt: new Date(),
      status: 'connected',
    });
  }

  async getMedia(userId: string, accountId: string, opts: { limit: number; after?: string }) {
    const account = await this.owned(userId, accountId);
    return this.withToken(account, (token) => this.graph.getMedia(token, account.platformAccountId, opts));
  }

  async getInsights(userId: string, accountId: string, opts: { metrics: string[]; days: number }) {
    const account = await this.owned(userId, accountId);
    const until = Math.floor(Date.now() / 1000);
    const since = until - opts.days * 86400;
    const metrics = await this.withToken(account, (token) =>
      this.graph.getInsights(token, account.platformAccountId, { metrics: opts.metrics, since, until }),
    );
    return { since: new Date(since * 1000), until: new Date(until * 1000), metrics };
  }

  async disconnect(userId: string, accountId: string) {
    const account = await this.owned(userId, accountId);
    await this.repository.update(account.id, {
      accessTokenEncrypted: null,
      tokenExpiresAt: null,
      status: 'disconnected',
    });
    this.logger.log({ event: 'instagram_disconnected', userId, accountId });
  }

  // ---------- internals ----------

  async owned(userId: string, accountId: string): Promise<OwnedAccount> {
    const account = await this.repository.findOwnedAccount(userId, accountId);
    if (!account) throw new NotFoundException('Instagram account not found');
    return account;
  }

  private toSafe(account: OwnedAccount) {
    const { accessTokenEncrypted: _token, ...safe } = account;
    return safe;
  }

  /** Runs a Graph call with the account's decrypted token: handles expiry, refresh and error mapping. */
  async withToken<T>(account: OwnedAccount, call: (token: string) => Promise<T>): Promise<T> {
    if (account.isMock !== (this.graph.mode === 'mock')) {
      throw new ConflictException('Account was connected in a different INSTAGRAM_MODE; reconnect it');
    }
    if (account.status === 'disconnected' || !account.accessTokenEncrypted) {
      throw new ConflictException('Instagram account is disconnected');
    }
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now()) {
      await this.repository.update(account.id, { status: 'expired' });
      throw new ConflictException('Instagram connection expired; reconnect the account');
    }
    let token = this.encryption.decrypt(account.accessTokenEncrypted);
    if (
      this.graph.loginFlow === 'instagram_login' &&
      account.tokenExpiresAt &&
      account.tokenExpiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS
    ) {
      try {
        const refreshed = await this.graph.refreshLongLived(token);
        token = refreshed.accessToken;
        await this.repository.update(account.id, {
          accessTokenEncrypted: this.encryption.encrypt(token),
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
        });
      } catch (error) {
        this.logger.warn({ event: 'instagram_refresh_failed', accountId: account.id, message: (error as Error).message });
      }
    }
    try {
      return await call(token);
    } catch (error: unknown) {
      throw await this.mapGraphError(account.id, error);
    }
  }

  private async mapGraphError(accountId: string, error: unknown): Promise<Error> {
    if (!(error instanceof MetaApiError)) return error as Error;
    if (error.isAuthError) {
      await this.repository.update(accountId, { status: 'expired' });
      return new ConflictException('Instagram connection expired; reconnect the account');
    }
    if (error.isRateLimit) {
      return new HttpException('Instagram rate limit reached; retry later', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error.isPermissionError) {
      return new ForbiddenException('Missing Instagram permission or metric unavailable for this account');
    }
    if (error.httpStatus === 504) return new ServiceUnavailableException('Instagram did not respond in time');
    return new BadGatewayException('Instagram request failed');
  }
}
