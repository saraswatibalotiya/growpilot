import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthRepository } from './auth.repository';
import type { NewRefreshToken } from './auth.types';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';

type StoredToken = NewRefreshToken & { revokedAt: Date | null };

function createRepository() {
  const tokens = new Map<string, StoredToken>();
  return {
    tokens,
    findByEmail: jest.fn(),
    createAccount: jest.fn(),
    findLoginUser: jest.fn(),
    findActiveUser: jest.fn(async (id: string) => ({ id, status: 'active' })),
    createRefreshToken: jest.fn(async (token: NewRefreshToken) => {
      tokens.set(token.id, { ...token, revokedAt: null });
      return { id: token.id };
    }),
    findRefreshToken: jest.fn(async (tokenHash: string) =>
      [...tokens.values()].find((t) => t.tokenHash === tokenHash) ?? null,
    ),
    revokeIfActive: jest.fn(async (id: string) => {
      const token = tokens.get(id);
      if (!token || token.revokedAt) return false;
      token.revokedAt = new Date();
      return true;
    }),
    revokeFamily: jest.fn(async (familyId: string) => {
      let count = 0;
      for (const token of tokens.values()) {
        if (token.familyId === familyId && !token.revokedAt) {
          token.revokedAt = new Date();
          count += 1;
        }
      }
      return count;
    }),
  };
}

function createService(repository: ReturnType<typeof createRepository>) {
  return new AuthService(
    repository as unknown as AuthRepository,
    new JwtService(),
    new ConfigService({ JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-bytes' }),
  );
}

describe('Signup', () => {
  const dto: SignupDto = {
    name: 'QA User',
    email: 'qa@example.test',
    password: 'test-only-passphrase',
    business: { name: 'QA Business', category: 'other' },
  };
  const repository = createRepository();
  const service = createService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findByEmail.mockResolvedValue(null);
    repository.createAccount.mockImplementation(async (id: string, businessId: string) => ({
      user: { id, name: dto.name, email: dto.email, status: 'active' },
      business: { id: businessId, ...dto.business },
    }));
  });

  it('hashes passwords and returns safe fields and a JWT', async () => {
    const response = await service.signup(dto);
    expect(response.accessToken).toEqual(expect.any(String));
    expect(response.refreshToken).toEqual(expect.any(String));
    expect(response.expiresIn).toBe(900);
    expect(response.user).not.toHaveProperty('passwordHash');
    const passwordHash = repository.createAccount.mock.calls[0][3] as string;
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    expect(passwordHash).not.toEqual(dto.password);
  });

  it('rejects duplicate emails, including database races', async () => {
    repository.findByEmail.mockResolvedValue({ id: 'existing' });
    await expect(service.signup(dto)).rejects.toThrow('Email already registered');
    repository.findByEmail.mockResolvedValue(null);
    repository.createAccount.mockRejectedValue({ sqlState: '23505' });
    await expect(service.signup(dto)).rejects.toThrow('Email already registered');
  });

  it('rejects passwords exceeding bcrypt byte limits', async () => {
    await expect(service.signup({ ...dto, password: '\u00e9'.repeat(40) }))
      .rejects.toThrow('72 UTF-8 bytes');
    expect(repository.createAccount).not.toHaveBeenCalled();
  });

  it('normalizes email and rejects client-supplied password hashes', async () => {
    const input = plainToInstance(SignupDto, {
      ...dto,
      email: ' QA@Example.Test ',
      password_hash: 'not-allowed',
    });
    expect(input.email).toBe('qa@example.test');
    const errors = await validate(input, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some(error => error.property === 'password_hash')).toBe(true);
  });
});

describe('Login, refresh and logout', () => {
  const password = 'correct-horse-battery';
  let repository: ReturnType<typeof createRepository>;
  let service: AuthService;

  beforeEach(async () => {
    repository = createRepository();
    service = createService(repository);
    repository.findLoginUser.mockImplementation(async (email: string) =>
      email === 'qa@example.test'
        ? { id: '7f6c8f5e-1d5b-4c1a-9d1e-3b2a1c0d9e8f', name: 'QA', email, status: 'active', passwordHash: await hash(password, 4) }
        : null,
    );
  });

  it('logs in with valid credentials and never returns the password hash', async () => {
    const response = await service.login({ email: 'qa@example.test', password });
    expect(response.accessToken).toEqual(expect.any(String));
    expect(response.refreshToken).toEqual(expect.any(String));
    expect(response.user).not.toHaveProperty('passwordHash');
    const stored = [...repository.tokens.values()][0];
    expect(stored.tokenHash).not.toEqual(response.refreshToken);
  });

  it('returns the same error for unknown email and wrong password', async () => {
    await expect(service.login({ email: 'qa@example.test', password: 'wrong-password-123' }))
      .rejects.toThrow('Invalid email or password');
    await expect(service.login({ email: 'nobody@example.test', password }))
      .rejects.toThrow('Invalid email or password');
  });

  it('rotates refresh tokens and rejects the old one', async () => {
    const { refreshToken } = await service.login({ email: 'qa@example.test', password });
    const rotated = await service.refresh(refreshToken);
    expect(rotated.refreshToken).not.toEqual(refreshToken);
    await expect(service.refresh(refreshToken)).rejects.toThrow('already used');
  });

  it('revokes the whole session when an old refresh token is reused', async () => {
    const { refreshToken } = await service.login({ email: 'qa@example.test', password });
    const rotated = await service.refresh(refreshToken);
    await expect(service.refresh(refreshToken)).rejects.toThrow();
    await expect(service.refresh(rotated.refreshToken)).rejects.toThrow('already used');
  });

  it('rejects expired and unknown refresh tokens', async () => {
    const { refreshToken } = await service.login({ email: 'qa@example.test', password });
    [...repository.tokens.values()][0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.refresh(refreshToken)).rejects.toThrow('expired');
    await expect(service.refresh('not-a-real-token')).rejects.toThrow('Invalid refresh token');
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await service.login({ email: 'qa@example.test', password });
    await service.logout(refreshToken);
    await expect(service.refresh(refreshToken)).rejects.toThrow();
  });
});