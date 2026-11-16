import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JWT_ALGORITHM, JWT_ALGORITHMS, JWT_ISSUER, JWT_OAUTH_STATE_AUDIENCE } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { OAuthNonceStore } from './oauth-nonce.store';

export interface OAuthStatePayload {
  userId: string;
  businessId: string;
}

const STATE_TTL_SECONDS = 600;

/** What the verified token holds; every field is checked before use. */
type OAuthStateClaims = Partial<OAuthStatePayload> & { nonce?: unknown };

function hasStateClaims(claims: OAuthStateClaims): claims is OAuthStatePayload & { nonce: string } {
  return typeof claims.userId === 'string' && typeof claims.businessId === 'string' && typeof claims.nonce === 'string';
}

export class StateReplayedError extends Error {}

/** Signed, single-use, 10-minute OAuth `state` (CSRF protection + binds the callback to user and business). */
@Injectable()
export class InstagramStateService {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly nonces: OAuthNonceStore,
  ) {}

  sign(payload: OAuthStatePayload): Promise<string> {
    return this.jwt.signAsync(
      { ...payload, nonce: randomUUID() },
      {
        secret: this.auth.signingSecret(),
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_OAUTH_STATE_AUDIENCE,
        expiresIn: STATE_TTL_SECONDS,
      },
    );
  }

  /** Verifies the signature and consumes the nonce; a second call with the same state fails. */
  async verify(state: string): Promise<OAuthStatePayload> {
    let payload: OAuthStateClaims;
    try {
      payload = await this.jwt.verifyAsync<OAuthStateClaims>(state, {
        secret: this.auth.signingSecret(),
        algorithms: JWT_ALGORITHMS,
        issuer: JWT_ISSUER,
        audience: JWT_OAUTH_STATE_AUDIENCE,
      });
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    // The signature proves we issued it, but a token from an older release could carry other claims.
    if (!hasStateClaims(payload)) throw new BadRequestException('Invalid or expired OAuth state');
    // Store errors propagate unchanged so an outage fails closed instead of looking like a bad state.
    if (!(await this.nonces.consume(payload.nonce, STATE_TTL_SECONDS))) {
      throw new StateReplayedError('OAuth state already used');
    }
    return { userId: payload.userId, businessId: payload.businessId };
  }
}
