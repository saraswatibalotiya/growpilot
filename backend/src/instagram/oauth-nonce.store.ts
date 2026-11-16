import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Records OAuth state nonces so each authorization URL can complete only once. */
export abstract class OAuthNonceStore {
  /** Returns true the first time a nonce is seen, false on every later attempt. */
  abstract consume(nonce: string, ttlSeconds: number): Promise<boolean>;
}

@Injectable()
export class RedisOAuthNonceStore extends OAuthNonceStore implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    super();
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(config.get<string>('REDIS_PORT') ?? 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
    });
  }

  async consume(nonce: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(`oauth:instagram:nonce:${nonce}`, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }
}

export class InMemoryOAuthNonceStore extends OAuthNonceStore {
  private readonly used = new Set<string>();

  async consume(nonce: string): Promise<boolean> {
    if (this.used.has(nonce)) return false;
    this.used.add(nonce);
    return true;
  }
}
