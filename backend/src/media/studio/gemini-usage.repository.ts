import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface GeminiUsageEvent {
  at: string;
  mediaId: string;
  model: string;
  style: string;
  costUsd: number;
  outcome: 'reserved' | 'stored' | 'rejected' | 'failed';
}

export interface GeminiDailyUsage {
  date: string;
  count: number;
  costUsd: number;
  events: GeminiUsageEvent[];
}

const today = (): string => new Date().toISOString().slice(0, 10);
const keyFor = (date: string) => `gemini-usage:${date}`;

/**
 * Per-business, per-UTC-day Gemini usage. Stored as one row per day in `generation_cache` so no schema change is needed.
 * A slot is reserved before the API call, so failed and rejected generations still count against the limit.
 */
@Injectable()
export class GeminiUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get rows() {
    return this.prisma.db.orm.public.GenerationCache;
  }

  async forDay(businessId: string, date = today()): Promise<GeminiDailyUsage> {
    const row = await this.rows.select('responseJson').where({ businessId, cacheKey: keyFor(date) }).first();
    return (row?.responseJson as GeminiDailyUsage | undefined) ?? { date, count: 0, costUsd: 0, events: [] };
  }

  /** Counts one generation. Returns false (and records nothing) when the limit is already reached. */
  async reserve(businessId: string, limit: number, event: Omit<GeminiUsageEvent, 'at' | 'outcome'>): Promise<boolean> {
    const date = today();
    const usage = await this.forDay(businessId, date);
    if (usage.count >= limit) return false;
    const next: GeminiDailyUsage = {
      date,
      count: usage.count + 1,
      costUsd: Math.round((usage.costUsd + event.costUsd) * 10_000) / 10_000,
      events: [...usage.events, { ...event, at: new Date().toISOString(), outcome: 'reserved' as const }].slice(-200),
    };
    await this.write(businessId, date, next, usage.count > 0 || usage.events.length > 0);
    return true;
  }

  /** Records how the most recent reserved generation for this media ended. Cost is kept: the call was made. */
  async settle(businessId: string, mediaId: string, outcome: GeminiUsageEvent['outcome']): Promise<void> {
    const date = today();
    const usage = await this.forDay(businessId, date);
    const index = usage.events.findLastIndex((e) => e.mediaId === mediaId && e.outcome === 'reserved');
    if (index < 0) return;
    usage.events[index] = { ...usage.events[index]!, outcome };
    await this.write(businessId, date, usage, true);
  }

  /** A previously generated Reel scene (stored image URL) for this cache key. */
  async findScene(businessId: string, key: string): Promise<string | null> {
    const row = await this.rows.select('responseJson').where({ businessId, cacheKey: `gemini-scene:${key}` }).first();
    return (row?.responseJson as { url?: string } | undefined)?.url ?? null;
  }

  async saveScene(businessId: string, key: string, url: string): Promise<void> {
    try {
      await this.rows.create({ id: crypto.randomUUID(), businessId, cacheKey: `gemini-scene:${key}`, responseJson: { url } as never });
    } catch {
      // A parallel render stored the same scene first.
    }
  }

  private async write(businessId: string, date: string, usage: GeminiDailyUsage, exists: boolean): Promise<void> {
    const cacheKey = keyFor(date);
    if (exists) {
      await this.rows.where({ businessId, cacheKey }).update({ responseJson: usage as never });
      return;
    }
    try {
      await this.rows.create({ id: crypto.randomUUID(), businessId, cacheKey, responseJson: usage as never });
    } catch {
      // A parallel request created today's row first.
      await this.rows.where({ businessId, cacheKey }).update({ responseJson: usage as never });
    }
  }
}
