import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { z } from 'zod';
import { readAiConfig } from './ai.config';
import { ModelRouterService, type AiTask } from './model-router.service';

/** The model answered, but not with something that matches the schema. Retried once by the caller. */
export class AiOutputInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiOutputInvalidError';
  }
}

type ImageInput = { type: 'url'; url: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string };

export interface ParseRequest<S extends z.ZodType> {
  task: AiTask;
  /** Stable instructions. Business facts and owner text belong in `messages`, not here. */
  system: string;
  schema: S;
  /** The user turn: dynamic context plus the owner's words. */
  user: string;
  /** Optional earlier turns, oldest first. */
  history?: ChatMessage[];
  images?: ImageInput[];
  /** Called with this request's own token counts, for per-request cost reporting. */
  onUsage?: (usage: { model: string; inputTokens: number; outputTokens: number }) => void;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The only class that talks to Anthropic. It validates every response against a Zod schema, maps SDK errors to
 * safe HTTP errors, and never logs transcripts, images or keys: only ids, model, latency and token counts.
 */
@Injectable()
export class ClaudeProviderService {
  private readonly logger = new Logger(ClaudeProviderService.name);
  private cached: Anthropic | undefined;
  private readonly usage = new Map<string, UsageTotals>();

  constructor(
    private readonly config: ConfigService,
    private readonly router: ModelRouterService,
  ) {}

  /** Lazily created so the app starts, and tests run, without a key. Replaceable in tests. */
  protected get client(): Anthropic {
    if (!this.cached) {
      const cfg = readAiConfig(this.config);
      if (!cfg.apiKey) throw new ServiceUnavailableException('The AI service is not configured');
      this.cached = new Anthropic({ apiKey: cfg.apiKey, maxRetries: cfg.maxRetries });
    }
    return this.cached;
  }

  /** Token and call counts per model since the process started, for cost monitoring. */
  usageSnapshot(): Record<string, UsageTotals> {
    return Object.fromEntries(this.usage);
  }

  async parse<S extends z.ZodType>(request: ParseRequest<S>): Promise<z.infer<S>> {
    const route = this.router.route(request.task);
    const content: Anthropic.ContentBlockParam[] = [
      ...(request.images ?? []).map((i): Anthropic.ContentBlockParam => ({ type: 'image', source: { type: 'url', url: i.url } })),
      { type: 'text', text: request.user },
    ];
    const started = Date.now();
    try {
      const response = await this.client.messages.parse(
        {
          model: route.model,
          max_tokens: route.maxTokens,
          system: request.system,
          messages: [...(request.history ?? []), { role: 'user', content }],
          output_config: { format: zodOutputFormat(request.schema) },
        },
        { timeout: route.timeoutMs },
      );
      this.record(route.model, request.task, started, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0, response._request_id ?? null);
      request.onUsage?.({ model: route.model, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 });

      if (response.stop_reason === 'refusal') {
        throw new UnprocessableEntityException('The AI could not help with that request');
      }
      if (response.stop_reason === 'max_tokens') throw new AiOutputInvalidError('response was cut off');
      if (response.parsed_output == null) throw new AiOutputInvalidError('response did not match the schema');
      return response.parsed_output as z.infer<S>;
    } catch (error) {
      throw this.mapError(error, route.model, request.task, started);
    }
  }

  private record(model: string, task: AiTask, started: number, input: number, output: number, requestId: string | null) {
    const totals = this.usage.get(model) ?? { calls: 0, inputTokens: 0, outputTokens: 0 };
    totals.calls += 1;
    totals.inputTokens += input;
    totals.outputTokens += output;
    this.usage.set(model, totals);
    this.logger.log({ event: 'ai_call', task, model, requestId, latencyMs: Date.now() - started, inputTokens: input, outputTokens: output });
  }

  private mapError(error: unknown, model: string, task: AiTask, started: number): Error {
    if (error instanceof HttpException || error instanceof AiOutputInvalidError) return error;
    const base = { event: 'ai_call_failed', task, model, latencyMs: Date.now() - started };
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      this.logger.warn({ ...base, category: 'timeout' });
      return new GatewayTimeoutException('The AI service took too long to respond. Please try again.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      this.logger.warn({ ...base, category: 'connection' });
      return new ServiceUnavailableException('Could not reach the AI service. Please try again.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      this.logger.warn({ ...base, category: 'rate_limit', requestId: error.requestID });
      return new HttpException('The AI service is busy. Please try again in a moment.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      this.logger.error({ ...base, category: 'auth', status: error.status, requestId: error.requestID });
      return new ServiceUnavailableException('The AI service is not configured correctly');
    }
    if (error instanceof Anthropic.NotFoundError) {
      this.logger.error({ ...base, category: 'model_not_found', requestId: error.requestID });
      return new ServiceUnavailableException('The configured AI model is not available');
    }
    if (error instanceof Anthropic.APIError) {
      this.logger.error({ ...base, category: error.status && error.status >= 500 ? 'upstream' : 'rejected', status: error.status, requestId: error.requestID });
      return error.status && error.status >= 500
        ? new ServiceUnavailableException('The AI service is temporarily unavailable. Please try again.')
        : new BadGatewayException('The AI service could not process this request');
    }
    // Not an API error: most likely the SDK failing to parse malformed JSON from the model.
    this.logger.warn({ ...base, category: 'unparseable_output' });
    return new AiOutputInvalidError('response could not be parsed');
  }
}
