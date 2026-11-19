import { ConfigService } from '@nestjs/config';

/**
 * The single place the Python AI engine settings are read. The engine is an optional, internal service: with
 * AI_ENGINE_ENABLED unset (the default) nothing in this module talks to it and every other feature is unaffected.
 */
export interface AiEngineConfig {
  enabled: boolean;
  /** Internal address of the engine. Never exposed to the browser. */
  baseUrl: string;
  /** Shared secret sent as a bearer token. Server to server only. */
  serviceToken: string | undefined;
  timeoutMs: number;
  /** Generating can include an AI wording pass, so it gets longer. */
  generateTimeoutMs: number;
  /** Extra attempts for calls that are safe to repeat. */
  maxRetries: number;
  /** Consecutive connection failures before calls fail fast for a while. */
  breakerThreshold: number;
  breakerCooldownMs: number;
  /** Most recent posts sent for one analysis. */
  maxPosts: number;
}

const int = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function readAiEngineConfig(config: ConfigService): AiEngineConfig {
  const rawUrl = (config.get<string>('AI_ENGINE_URL') || 'http://127.0.0.1:8001').trim().replace(/\/+$/, '');
  return {
    enabled: config.get<string>('AI_ENGINE_ENABLED') === 'true',
    baseUrl: /^https?:\/\/[^\s]+$/.test(rawUrl) ? rawUrl : 'http://127.0.0.1:8001',
    serviceToken: config.get<string>('AI_ENGINE_SERVICE_TOKEN') || undefined,
    timeoutMs: int(config.get<string>('AI_ENGINE_TIMEOUT_MS'), 15_000, 500, 120_000),
    generateTimeoutMs: int(config.get<string>('AI_ENGINE_GENERATE_TIMEOUT_MS'), 60_000, 1_000, 300_000),
    maxRetries: int(config.get<string>('AI_ENGINE_MAX_RETRIES'), 2, 0, 5),
    breakerThreshold: int(config.get<string>('AI_ENGINE_BREAKER_THRESHOLD'), 5, 1, 100),
    breakerCooldownMs: int(config.get<string>('AI_ENGINE_BREAKER_COOLDOWN_MS'), 30_000, 1_000, 600_000),
    maxPosts: int(config.get<string>('AI_ENGINE_MAX_POSTS'), 200, 5, 500),
  };
}
