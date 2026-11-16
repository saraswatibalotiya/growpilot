import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import {
  INSTAGRAM_SYNC_QUEUE,
  redisOptions,
  SYNC_MEDIA_JOB,
  type MediaSyncJob,
} from './instagram-sync.queue';
import { InstagramSyncService, SyncJobFailed } from './instagram-sync.service';

@Injectable()
export class InstagramSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InstagramSyncWorker.name);
  private worker?: Worker<MediaSyncJob>;

  constructor(
    private readonly sync: InstagramSyncService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Lets API-only instances (or tests) run without consuming jobs.
    if (this.config.get<string>('INSTAGRAM_SYNC_WORKER') === 'false' || this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.worker = new Worker<MediaSyncJob>(INSTAGRAM_SYNC_QUEUE, (job) => this.process(job), {
      connection: redisOptions(this.config, true),
      concurrency: 1, // one sync at a time keeps us well inside Meta's rate limits
    });
    this.worker.on('error', (error) => this.logger.warn({ event: 'instagram_sync_worker_error', message: error.message }));
  }

  private async process(job: Job<MediaSyncJob>): Promise<number> {
    if (job.name !== SYNC_MEDIA_JOB) throw new UnrecoverableError(`Unknown job ${job.name}`);
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    try {
      return await this.sync.runMediaSync(job.data.accountId, job.data.runId, isLastAttempt);
    } catch (error) {
      // SyncJobFailed is final (the run is already marked failed): stop BullMQ from retrying it.
      if (error instanceof SyncJobFailed) throw new UnrecoverableError(error.message);
      throw error; // SyncRetryable: BullMQ retries with exponential backoff
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
