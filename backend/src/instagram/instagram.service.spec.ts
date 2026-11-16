import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { InstagramGraphClient } from './instagram-graph.client';
import { InstagramStateService } from './instagram-state.service';
import { InstagramRepository } from './instagram.repository';
import { InstagramService } from './instagram.service';
import { InMemoryOAuthNonceStore } from './oauth-nonce.store';
import { TokenEncryptionService } from './token-encryption.service';

const env = {
  INSTAGRAM_MODE: 'mock',
  INSTAGRAM_APP_ID: 'app',
  INSTAGRAM_APP_SECRET: 'secret',
  INSTAGRAM_REDIRECT_URI: 'http://localhost:4000/integrations/instagram/callback',
  FRONTEND_URL: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-bytes',
  INSTAGRAM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

function build(overrides: Record<string, string> = {}) {
  const config = new ConfigService({ ...env, ...overrides });
  const jwt = new JwtService();
  const repository = {
    findOwnedBusiness: jest.fn().mockResolvedValue({ id: 'b' }),
    findByPlatformAccountId: jest.fn().mockResolvedValue(null),
    findByBusiness: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async (id: string, data: object) => ({ id, ...data })),
    update: jest.fn(),
  };
  const encryption = new TokenEncryptionService(config);
  const service = new InstagramService(
    new InstagramGraphClient(config),
    new InstagramStateService(jwt, new AuthService({} as never, jwt, config), new InMemoryOAuthNonceStore()),
    repository as unknown as InstagramRepository,
    encryption,
    config,
  );
  return { service, repository, encryption };
}

describe('InstagramService (mock mode)', () => {
  it('connect -> callback stores an encrypted token and redirects to success', async () => {
    const { service, repository, encryption } = build();
    const { authorizationUrl } = await service.createAuthorizationUrl('u', 'b');
    const state = new URL(authorizationUrl).searchParams.get('state')!;

    const redirect = await service.handleCallback({ code: 'mock-code', state });

    expect(redirect).toBe('http://localhost:3000/connect/instagram?status=success');
    const saved = repository.create.mock.calls[0][1];
    expect(saved.isMock).toBe(true);
    expect(saved.accessTokenEncrypted).not.toContain('mock-long-token');
    expect(encryption.decrypt(saved.accessTokenEncrypted)).toBe('mock-long-token');
  });

  it('rejects a replayed state after the first successful callback', async () => {
    const { service, repository } = build();
    const { authorizationUrl } = await service.createAuthorizationUrl('u', 'b');
    const state = new URL(authorizationUrl).searchParams.get('state')!;

    expect(await service.handleCallback({ code: 'mock-code', state })).toContain('status=success');
    expect(await service.handleCallback({ code: 'mock-code', state })).toContain('code=invalid_state');
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered state without storing anything', async () => {
    const { service, repository } = build();
    const redirect = await service.handleCallback({ code: 'mock-code', state: 'forged' });
    expect(redirect).toContain('code=invalid_state');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reports user denial', async () => {
    const { service } = build();
    expect(await service.handleCallback({ error: 'access_denied' })).toContain('code=denied');
  });

  it('refuses an account already connected to another business', async () => {
    const { service, repository } = build();
    repository.findByPlatformAccountId.mockResolvedValue({ id: 'x', businessId: 'other' });
    const { authorizationUrl } = await service.createAuthorizationUrl('u', 'b');
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    expect(await service.handleCallback({ code: 'mock-code', state })).toContain('code=account_in_use');
  });
});

describe('InstagramService (live mode guard)', () => {
  it('blocks accounts that are not on the allowlist', async () => {
    const { service } = build({ INSTAGRAM_MODE: 'live', INSTAGRAM_LIVE_ALLOWLIST: '' });
    // exchangeCode would hit Meta; stub the client for this unit test
    (service as any).graph.exchangeCode = async () => ({ accessToken: 's', userId: '1', permissions: [] });
    (service as any).graph.exchangeLongLived = async () => ({ accessToken: 'l', expiresInSeconds: 60 });
    (service as any).graph.getProfile = async () => ({ id: '1', username: 'someone', name: null, accountType: 'BUSINESS' });
    const { authorizationUrl } = await service.createAuthorizationUrl('u', 'b');
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    expect(authorizationUrl).toContain('instagram.com/oauth/authorize');
    expect(authorizationUrl).not.toContain('content_publish');
    expect(await service.handleCallback({ code: 'c', state })).toContain('code=not_allowlisted');
  });
});
