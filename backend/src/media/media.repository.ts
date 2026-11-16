import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface MediaAssetWrite {
  businessId: string;
  cloudinaryPublicId: string;
  secureUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  bytes: number;
  sha256: string;
  sourceAssetId?: string;
  variant?: 'original' | 'enhanced' | 'ai_edited' | 'poster';
  processingKey?: string;
  processingJson?: unknown;
}

const MEDIA_FIELDS = [
  'id',
  'businessId',
  'secureUrl',
  'mimeType',
  'width',
  'height',
  'bytes',
  'sha256',
  'createdAt',
  'sourceAssetId',
  'variant',
  'processingKey',
  'processingJson',
  'approvedAt',
] as const;

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get assets() {
    return this.prisma.db.orm.public.MediaAsset;
  }

  create(id: string, data: MediaAssetWrite) {
    return this.assets.select(...MEDIA_FIELDS).create({ id, ...data } as never);
  }

  /** A processed copy of `sourceAssetId` made with exactly these settings (the cache lookup). */
  findVariant(sourceAssetId: string, processingKey: string) {
    return this.assets.select(...MEDIA_FIELDS).where({ sourceAssetId, processingKey }).first();
  }

  listVariants(sourceAssetId: string) {
    return this.assets
      .select(...MEDIA_FIELDS)
      .where({ sourceAssetId })
      .orderBy((a) => a.createdAt.asc())
      .all();
  }

  async markApproved(id: string, at: Date) {
    await this.assets.where({ id }).update({ approvedAt: at });
  }

  private get analyses() {
    return this.prisma.db.orm.public.MediaAnalysis;
  }

  async findAnalysis(mediaAssetId: string, kind: string, version: string) {
    return this.analyses.select('resultJson', 'usageJson', 'createdAt').where({ mediaAssetId, kind, version }).first();
  }

  async saveAnalysis(mediaAssetId: string, kind: string, version: string, result: unknown, usage: unknown) {
    try {
      await this.analyses.create({ id: crypto.randomUUID(), mediaAssetId, kind, version, resultJson: result as never, usageJson: usage as never });
    } catch {
      // A parallel request stored the same analysis first.
    }
  }

  findById(id: string) {
    return this.assets.select(...MEDIA_FIELDS).where({ id }).first();
  }

  /** The same picture (same bytes) uploaded earlier by this business, if any. */
  findByHash(businessId: string, sha256: string) {
    return this.assets.select(...MEDIA_FIELDS).where({ businessId, sha256 }).first();
  }

  /** Used to check that an image URL is one we stored, and to read its type and size. */
  findBySecureUrl(secureUrl: string) {
    return this.assets.select(...MEDIA_FIELDS).where({ secureUrl }).first();
  }
}
