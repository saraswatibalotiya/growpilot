import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Remembers a finished AI answer so the same request is not paid for twice. The key is the photos' content hashes
 * (in order), the owner's words, the language and the product, so a different instruction always gets a fresh answer.
 */
@Injectable()
export class GenerationCacheRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get cache() {
    return this.prisma.db.orm.public.GenerationCache;
  }

  static keyFor(parts: { photoHashes: string[]; transcript: string; language?: string; productId?: string; tone?: string; captionLength?: string; hashtagLevel?: string }): string {
    const words = parts.transcript.toLowerCase().replace(/\s+/g, ' ').trim();
    return createHash('sha256').update(JSON.stringify([parts.photoHashes, words, parts.language ?? '', parts.productId ?? '', parts.tone ?? '', parts.captionLength ?? '', parts.hashtagLevel ?? ''])).digest('hex');
  }

  async find(businessId: string, cacheKey: string): Promise<unknown | null> {
    const row = await this.cache.select('responseJson').where({ businessId, cacheKey }).first();
    return row ? row.responseJson : null;
  }

  async save(businessId: string, cacheKey: string, response: unknown): Promise<void> {
    if (await this.find(businessId, cacheKey)) return;
    try {
      await this.cache.create({ id: crypto.randomUUID(), businessId, cacheKey, responseJson: response as never });
    } catch {
      // A parallel request saved the same answer first. Nothing to do.
    }
  }
}
