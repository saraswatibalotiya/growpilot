import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface SocialAccountWrite {
  businessId: string;
  platformAccountId: string;
  username: string | null;
  displayName: string | null;
  accountType: string | null;
  permissionsJson: string[];
  isMock: boolean;
  lastSyncedAt: Date;
  accessTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  tokenSource?: 'oauth' | 'dashboard';
  followerCount: number | null;
  postCount: number | null;
  status: 'connected' | 'expired' | 'error' | 'disconnected';
}

const SAFE_FIELDS = [
  'id',
  'businessId',
  'platform',
  'platformAccountId',
  'username',
  'displayName',
  'accountType',
  'permissionsJson',
  'isMock',
  'lastSyncedAt',
  'tokenExpiresAt',
  'followerCount',
  'postCount',
  'status',
  'createdAt',
] as const;

@Injectable()
export class InstagramRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get accounts() {
    return this.prisma.db.orm.public.SocialAccount;
  }

  findOwnedBusiness(userId: string, businessId: string) {
    return this.prisma.db.orm.public.Business.select('id').where({ id: businessId, userId }).first();
  }

  listForBusiness(businessId: string) {
    return this.accounts.select(...SAFE_FIELDS).where({ businessId, platform: 'instagram' }).all();
  }

  /** Account by id, only if its business belongs to the user. Includes the encrypted token. */
  async findOwnedAccount(userId: string, accountId: string) {
    const account = await this.accounts.where({ id: accountId, platform: 'instagram' }).first();
    if (!account) return null;
    return (await this.findOwnedBusiness(userId, account.businessId)) ? account : null;
  }

  findByPlatformAccountId(platformAccountId: string) {
    return this.accounts.select('id', 'businessId').where({ platform: 'instagram', platformAccountId }).first();
  }

  findByBusiness(businessId: string) {
    return this.accounts.select('id', 'platformAccountId').where({ businessId, platform: 'instagram' }).first();
  }

  async create(id: string, data: SocialAccountWrite) {
    return this.accounts.select(...SAFE_FIELDS).create({ id, platform: 'instagram', ...data });
  }

  async update(id: string, data: Partial<SocialAccountWrite>) {
    await this.accounts.where({ id }).update(data);
    return this.accounts.select(...SAFE_FIELDS).where({ id }).first();
  }
}
