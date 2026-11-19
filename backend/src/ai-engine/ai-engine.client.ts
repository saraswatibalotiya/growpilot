import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AiEngineConfig, readAiEngineConfig } from './ai-engine.config';

export type AiEngineErrorKind =
  | 'disabled'
  | 'circuit_open'
  | 'unreachable'
  | 'timeout'
  | 'unauthorized'
  | 'rate_limited'
  | 'not_found'
  | 'conflict'
  | 'invalid_request'
  | 'ai_provider'
  | 'unavailable'
  | 'bad_response';

/** What went wrong talking to the engine. It carries no request body, no token and no engine internals. */
export class AiEngineError extends Error {
  constructor(
    readonly kind: AiEngineErrorKind,
    message: string,
    readonly status?: number,
    readonly engineCode?: string,
  ) {
    super(message);
    this.name = 'AiEngineError';
  }
}

export interface AiEngineRequest {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Correlation id, sent as X-Request-ID so both services log the same id. */
  requestId: string;
  /** Safe to send twice with the same effect. Only these calls are retried. */
  idempotent?: boolean;
  timeoutMs?: number;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const API_PREFIX = '/api/v1';

/**
 * The only code that talks to the Python engine: authentication, timeouts, bounded retries for safe calls,
 * a circuit breaker so a down engine costs a request nothing but one fast 503, and correlation ids.
 */
@Injectable()
export class AiEngineClient {
  private readonly logger = new Logger(AiEngineClient.name);
  readonly config: AiEngineConfig;
  /** Replaceable in tests. */
  fetchFn: typeof fetch = (input, init) => fetch(input, init);
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  now: () => number = () => Date.now();

  private consecutiveFailures = 0;
  private openUntil = 0;

  constructor(configService: ConfigService) {
    this.config = readAiEngineConfig(configService);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  /** Returns the `data` of the engine's response envelope. Throws AiEngineError. */
  async call<T>(req: AiEngineRequest): Promise<T> {
    if (!this.config.enabled) throw new AiEngineError('disabled', 'The AI engine is turned off.');
    this.assertCircuitClosed();
    const attempts = 1 + (req.idempotent ? this.config.maxRetries : 0);
    let lastError: AiEngineError | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const startedAt = this.now();
      try {
        const data = await this.once<T>(req);
        this.recordSuccess();
        this.logger.log(`${req.method} ${req.path} ok in ${this.now() - startedAt}ms [${req.requestId}]`);
        return data;
      } catch (error) {
        lastError = error instanceof AiEngineError ? error : new AiEngineError('unreachable', 'The AI engine could not be reached.');
        this.logger.warn(`${req.method} ${req.path} ${lastError.kind}${lastError.status ? ` (${lastError.status})` : ''} on attempt ${attempt}/${attempts} [${req.requestId}]`);
        if (lastError.kind === 'unreachable' || lastError.kind === 'timeout') this.recordConnectionFailure();
        else this.consecutiveFailures = 0; // the engine answered, so it is up
        if (attempt === attempts || !this.isRetryable(lastError) || this.isOpen()) break;
        await this.sleep(this.backoffMs(attempt, lastError));
      }
    }
    throw lastError ?? new AiEngineError('unreachable', 'The AI engine could not be reached.');
  }

  /** A quick liveness probe for the status endpoint. Never throws. */
  async isHealthy(requestId: string): Promise<boolean> {
    if (!this.config.enabled || this.isOpen()) return false;
    try {
      await this.once({ method: 'GET', path: '/health', requestId, timeoutMs: 2_000 });
      return true;
    } catch {
      return false;
    }
  }

  private async once<T>(req: AiEngineRequest): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${API_PREFIX}${req.path}`);
    for (const [key, value] of Object.entries(req.query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers: Record<string, string> = { accept: 'application/json', 'x-request-id': req.requestId };
    if (this.config.serviceToken) headers.authorization = `Bearer ${this.config.serviceToken}`;
    if (req.body !== undefined) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: AbortSignal.timeout(req.timeoutMs ?? this.config.timeoutMs),
        redirect: 'error', // the engine never redirects; following one could leak the token elsewhere
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') throw new AiEngineError('timeout', 'The AI engine took too long to answer.');
      throw new AiEngineError('unreachable', 'The AI engine could not be reached.');
    }

    const payload = await response.json().catch(() => undefined) as { data?: unknown; error?: { code?: unknown; message?: unknown } } | undefined;
    if (response.ok) {
      if (!payload || !('data' in payload)) throw new AiEngineError('bad_response', 'The AI engine sent an unexpected response.', response.status);
      return payload.data as T;
    }
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : undefined;
    // Engine messages for 404/409 are written for callers (never include values); anything else is replaced by a generic one.
    const engineMessage = typeof payload?.error?.message === 'string' ? payload.error.message.slice(0, 200) : undefined;
    throw this.errorFor(response, code, engineMessage);
  }

  private errorFor(response: Response, code: string | undefined, engineMessage: string | undefined): AiEngineError {
    const status = response.status;
    if (status === 401) return new AiEngineError('unauthorized', 'The AI engine rejected our service credentials.', status, code);
    if (status === 404) return new AiEngineError('not_found', engineMessage ?? 'Not found.', status, code);
    if (status === 409) return new AiEngineError('conflict', engineMessage ?? 'The AI engine needs more data first.', status, code);
    if (status === 429) return new AiEngineError('rate_limited', 'The AI engine is busy.', status, code);
    if (status === 422 || status === 413 || status === 400) return new AiEngineError('invalid_request', 'The AI engine rejected the request.', status, code);
    if (status === 502 && code?.startsWith('ai_')) return new AiEngineError('ai_provider', 'The AI wording service failed. Try again, or generate without AI wording.', status, code);
    if (status === 503 && code === 'ai_not_configured') return new AiEngineError('ai_provider', 'AI wording is not configured on the AI engine.', status, code);
    return new AiEngineError('unavailable', 'The AI engine is not available.', status, code);
  }

  private isRetryable(error: AiEngineError): boolean {
    if (error.kind === 'unreachable' || error.kind === 'timeout') return true;
    return error.status !== undefined && RETRYABLE_STATUS.has(error.status) && error.kind !== 'ai_provider';
  }

  private backoffMs(attempt: number, error: AiEngineError): number {
    const base = Math.min(200 * 2 ** (attempt - 1), 2_000);
    return error.kind === 'rate_limited' ? Math.max(base, 1_000) : base + Math.floor(Math.random() * 100);
  }

  private isOpen(): boolean {
    return this.now() < this.openUntil;
  }

  private assertCircuitClosed(): void {
    if (this.isOpen()) throw new AiEngineError('circuit_open', 'The AI engine is temporarily unavailable.');
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  private recordConnectionFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.config.breakerThreshold) {
      this.openUntil = this.now() + this.config.breakerCooldownMs;
      this.consecutiveFailures = 0;
      this.logger.error(`AI engine unreachable: failing fast for ${this.config.breakerCooldownMs}ms`);
    }
  }
}
