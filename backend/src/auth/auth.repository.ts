import { Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { USER_STATUS } from '../common/constants';
import { PrismaService } from '../database/prisma.service';
import type { ActiveUserRow, CreatedAccount, LoginUser, NewRefreshToken, StoredRefreshToken, UserIdRow } from './auth.types';
import type { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserIdRow | null> {
    return this.prisma.db.orm.public.User.select('id').where({ email }).first();
  }

  findLoginUser(email: string): Promise<LoginUser | null> {
    return this.prisma.db.orm.public.User
      .select('id', 'name', 'email', 'status', 'passwordHash')
      .where({ email })
      .first();
  }

  findActiveUser(id: string): Promise<ActiveUserRow | null> {
    return this.prisma.db.orm.public.User
      .select('id', 'status')
      .where({ id, status: USER_STATUS.Active })
      .first();
  }

  createRefreshToken(token: NewRefreshToken): Promise<UserIdRow> {
    return this.prisma.db.orm.public.RefreshToken.select('id').create(token);
  }

  findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.db.orm.public.RefreshToken
      .select('id', 'userId', 'familyId', 'expiresAt', 'revokedAt')
      .where({ tokenHash })
      .first();
  }

  /** Returns false if another request already revoked (rotated) this token. */
  async revokeIfActive(id: string): Promise<boolean> {
    const count = await this.prisma.db.orm.public.RefreshToken
      .where((t) => and(t.id.eq(id), t.revokedAt.isNull()))
      .updateAndCount({ revokedAt: new Date() });
    return count === 1;
  }

  /** Revokes every still-active token of the session; returns how many were revoked. */
  revokeFamily(familyId: string): Promise<number> {
    return this.prisma.db.orm.public.RefreshToken
      .where((t) => and(t.familyId.eq(familyId), t.revokedAt.isNull()))
      .updateAndCount({ revokedAt: new Date() });
  }

  createAccount(id: string, businessId: string, dto: SignupDto, passwordHash: string): Promise<CreatedAccount> {
    return this.prisma.db.transaction(async (transaction) => {
      const user = await transaction.orm.public.User
        .select('id', 'name', 'email', 'status')
        .create({ id, name: dto.name, email: dto.email, passwordHash });
      const business = await transaction.orm.public.Business
        .select('id', 'name', 'category')
        .create({ id: businessId, userId: id, ...dto.business });
      return { user, business };
    });
  }
}