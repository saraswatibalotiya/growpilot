import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';

export const INSTAGRAM_SYNC_QUEUE = 'instagram-sync';
export const SYNC_MEDIA_JOB = 'sync-media';
/** 6 attempts with exponential backoff from 60s: waits of 1, 2, 4, 8, 16 minutes between them. */
const SYNC_ATTEMPTS = 6;
const SYNC_BACKOFF_MS = 60_000;

export interface MediaSyncJob {
  accountId: string;
  runId: string;
}

/** Redis connection options shared by the queue (producer) and the worker. Never contains Instagram tokens. */
export function redisOptions(config: ConfigService, forWorker: boolean): ConnectionOptions {
  return {
    host: config.get<string>('REDIS_HOST') ?? 'localhost',
    port: Number(config.get<string>('REDIS_PORT') ?? 6379),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    connectTimeout: 2000,
    // Workers block on Redis and must retry forever; the producer fails fast so an API call can't hang.
    ...(forWorker ? { maxRetriesPerRequest: null } : { maxRetriesPerRequest: 1, enableOfflineQueue: false }),
  };
}

@Injectable()
export class InstagramSyncQueue implements OnModuleDestroy {
  private readonly logger = new Logger(InstagramSyncQueue.name);
  private queue?: Queue<MediaSyncJob>;

  constructor(private readonly config: ConfigService) {}

  private get(): Queue<MediaSyncJob> {
    if (!this.queue) {
      this.queue = new Queue<MediaSyncJob>(INSTAGRAM_SYNC_QUEUE, {
        connection: redisOptions(this.config, false),
      });
      this.queue.on('error', (error) => this.logger.warn({ event: 'instagram_sync_queue_error', message: error.message }));
    }
    return this.queue;
  }

  /** One job per account at a time: a repeated jobId is ignored while the earlier job still exists. */
  async enqueueMediaSync(job: MediaSyncJob): Promise<void> {
    await this.get().add(SYNC_MEDIA_JOB, job, {
      jobId: `sync-media-${job.accountId}`,
      attempts: SYNC_ATTEMPTS,
      backoff: { type: 'exponential', delay: SYNC_BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: true, // the run outcome lives in sync_runs
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
