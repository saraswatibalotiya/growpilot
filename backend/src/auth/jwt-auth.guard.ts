import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { JWT_ACCESS_AUDIENCE, JWT_ALGORITHMS, JWT_ISSUER } from './auth.constants';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly repository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Bearer token required');
    const secret = this.auth.signingSecret();
    let payload: { sub?: unknown; exp?: unknown };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: unknown; exp?: unknown }>(match[1], {
        secret,
        algorithms: JWT_ALGORITHMS,
        issuer: JWT_ISSUER,
        audience: JWT_ACCESS_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (typeof payload.sub !== 'string' || !isUUID(payload.sub) || typeof payload.exp !== 'number') {
      throw new UnauthorizedException('Invalid access token claims');
    }
    if (!(await this.repository.findActiveUser(payload.sub))) {
      throw new UnauthorizedException('User is not active');
    }
    request.userId = payload.sub;
    return true;
  }
}