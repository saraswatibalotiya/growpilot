import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { USER_STATUS } from '../common/constants';
import { isUniqueViolation } from '../common/database-errors';
import {
  ACCESS_TOKEN_TYPE,
  ACCESS_TTL,
  BCRYPT_ROUNDS,
  JWT_ACCESS_AUDIENCE,
  JWT_ALGORITHM,
  JWT_ISSUER,
  MAX_PASSWORD_BYTES,
  MIN_JWT_SECRET_BYTES,
  REFRESH_TTL,
} from './auth.constants';
import { AuthRepository } from './auth.repository';
import type { AuthTokens, CreatedAccount, LoginResponse, SignupResponse } from './auth.types';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Compared against when the email is unknown, so login timing doesn't reveal registered emails.
  private readonly dummyHash = hash(randomUUID(), BCRYPT_ROUNDS);

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signingSecret(): string {
    const secret =
      this.config.get<string>('JWT_ACCESS_SECRET') ??
      this.config.get<string>('JWT_SECRET');
    if (!secret || Buffer.byteLength(secret) < MIN_JWT_SECRET_BYTES) {
      throw new ServiceUnavailableException(`Set a JWT_ACCESS_SECRET of at least ${MIN_JWT_SECRET_BYTES} bytes`);
    }
    return secret;
  }

  private ttl({ env, fallback, min, max }: { env: string; fallback: number; min: number; max: number }): number {
    const value = Number(this.config.get(env) ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new ServiceUnavailableException(`${env} must be between ${min} and ${max}`);
    }
    return value;
  }

  private async issueTokens(userId: string, familyId: string = randomUUID()): Promise<AuthTokens> {
    const expiresIn = this.ttl(ACCESS_TTL);
    const refreshExpiresIn = this.ttl(REFRESH_TTL);
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.signingSecret(),
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_ACCESS_AUDIENCE,
        expiresIn,
      },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await this.repository.createRefreshToken({
      id: randomUUID(),
      userId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
    });
    return { accessToken, tokenType: ACCESS_TOKEN_TYPE, expiresIn, refreshToken, refreshExpiresIn };
  }

  async signup(dto: SignupDto): Promise<SignupResponse> {
    if (Buffer.byteLength(dto.password, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new BadRequestException(`Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes`);
    }
    if (await this.repository.findByEmail(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    this.signingSecret();
    const id = randomUUID();
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    let account: CreatedAccount;
    try {
      account = await this.repository.createAccount(id, randomUUID(), dto, passwordHash);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
    this.logger.log({ event: 'user_signed_up', userId: id });
    return { ...account, ...(await this.issueTokens(id)) };
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.repository.findLoginUser(dto.email);
    // An unknown email still runs one bcrypt compare, so it takes as long as a wrong password.
    const passwordHash = user ? user.passwordHash : await this.dummyHash;
    const valid = await compare(dto.password, passwordHash);
    if (!user || !valid || user.status !== USER_STATUS.Active) {
      throw new UnauthorizedException('Invalid email or password');
    }
    this.logger.log({ event: 'user_logged_in', userId: user.id });
    const { passwordHash: _hash, ...safeUser } = user;
    return { user: safeUser, ...(await this.issueTokens(user.id)) };
  }

  /** Rotates the refresh token. Reusing an already-rotated token revokes its whole family. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.repository.findRefreshToken(hashToken(refreshToken));
    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    if (stored.revokedAt || !(await this.repository.revokeIfActive(stored.id))) {
      await this.repository.revokeFamily(stored.familyId);
      this.logger.warn({ event: 'refresh_token_reuse', userId: stored.userId });
      throw new UnauthorizedException('Refresh token was already used; please log in again');
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired; please log in again');
    }
    if (!(await this.repository.findActiveUser(stored.userId))) {
      await this.repository.revokeFamily(stored.familyId);
      throw new UnauthorizedException('User is not active');
    }
    return this.issueTokens(stored.userId, stored.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.repository.findRefreshToken(hashToken(refreshToken));
    if (stored) {
      await this.repository.revokeFamily(stored.familyId);
      this.logger.log({ event: 'user_logged_out', userId: stored.userId });
    }
  }
}