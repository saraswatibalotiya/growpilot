import { Injectable } from '@nestjs/common';
import { type BusinessCategory, type Language } from '../common/constants';
import { PrismaService } from '../database/prisma.service';

export interface BusinessProfileWrite {
  name?: string;
  category?: BusinessCategory;
  preferredLanguage?: Language | null;
  supportedLanguages?: string[] | null;
  description?: string | null;
  city?: string | null;
  area?: string | null;
  targetAudience?: string | null;
}

const PROFILE_FIELDS = [
  'id',
  'name',
  'category',
  'preferredLanguage',
  'supportedLanguages',
  'description',
  'city',
  'area',
  'targetAudience',
  'createdAt',
  'updatedAt',
] as const;

@Injectable()
export class BusinessRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get businesses() {
    return this.prisma.db.orm.public.Business;
  }

  /** The owner's business. Signup creates one; the oldest is the primary business. */
  findPrimaryForUser(userId: string) {
    return this.businesses
      .select(...PROFILE_FIELDS)
      .where({ userId })
      .orderBy((b) => b.createdAt.asc())
      .first();
  }

  async create(id: string, userId: string, data: Required<Pick<BusinessProfileWrite, 'name' | 'category'>> & BusinessProfileWrite) {
    return this.businesses.select(...PROFILE_FIELDS).create({ id, userId, ...data });
  }

  async update(id: string, userId: string, data: BusinessProfileWrite) {
    await this.businesses.where({ id, userId }).update(data);
    return this.businesses.select(...PROFILE_FIELDS).where({ id, userId }).first();
  }
}
