import Anthropic from '@anthropic-ai/sdk';
import { GatewayTimeoutException, HttpException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AiOutputInvalidError, ClaudeProviderService } from './claude-provider.service';
import { ModelRouterService } from './model-router.service';

const SCHEMA = z.object({ ok: z.boolean() });
const ENV = { ANTHROPIC_API_KEY: 'sk-ant-test', CLAUDE_HAIKU_MODEL: 'haiku-x', CLAUDE_SONNET_MODEL: 'sonnet-x' };

/** Swaps the real SDK client for a fake so no network call is ever made. */
class TestProvider extends ClaudeProviderService {
  parseMock = jest.fn();
  protected override get client(): Anthropic {
    return { messages: { parse: this.parseMock } } as unknown as Anthropic;
  }
}

function build() {
  const config = new ConfigService(ENV);
  return new TestProvider(config, new ModelRouterService(config));
}

const ok = (over: Record<string, unknown> = {}) => ({ parsed_output: { ok: true }, stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, _request_id: 'req_1', ...over });
const request = { task: 'intent' as const, system: 'RULES', user: 'owner text', schema: SCHEMA };

describe('ClaudeProviderService', () => {
  it('returns the validated output and tracks token usage per model', async () => {
    const p = build();
    p.parseMock.mockResolvedValue(ok());
    await expect(p.parse(request)).resolves.toEqual({ ok: true });
    await p.parse(request);
    expect(p.usageSnapshot()).toEqual({ 'haiku-x': { calls: 2, inputTokens: 20, outputTokens: 10 } });
  });

  it('uses the model for the task, keeps instructions in system, and sends no sampling or thinking options', async () => {
    const p = build();
    p.parseMock.mockResolvedValue(ok());
    await p.parse({ ...request, task: 'content', images: [{ type: 'url', url: 'https://res.cloudinary.com/x/image/upload/a.png' }] });
    const [params, options] = p.parseMock.mock.calls[0];
    expect(params.model).toBe('sonnet-x');
    expect(params.system).toBe('RULES');
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
    expect(params).not.toHaveProperty('tool_choice');
    expect(params.output_config.format).toBeDefined();
    expect(params.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'url' } });
    expect(options.timeout).toBeGreaterThan(0);
  });

  it('turns a timeout into a 504 and a dropped connection into a 503', async () => {
    const p = build();
    p.parseMock.mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError({ message: 'timed out' }));
    await expect(p.parse(request)).rejects.toBeInstanceOf(GatewayTimeoutException);
    p.parseMock.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: 'down' }));
    await expect(p.parse(request)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('turns a rate limit into a 429 that does not expose Anthropic details', async () => {
    const p = build();
    p.parseMock.mockRejectedValue(Anthropic.APIError.generate(429, { error: { message: 'org limit xyz' } }, 'rate limited', new Headers()));
    const error = (await p.parse(request).catch((e: HttpException) => e)) as HttpException;
    expect(error.getStatus()).toBe(429);
    expect(error.message).not.toContain('xyz');
  });

  it('reports a bad key or missing model as "not configured", never leaking the key', async () => {
    const p = build();
    p.parseMock.mockRejectedValueOnce(Anthropic.APIError.generate(401, { error: { message: 'invalid x-api-key' } }, 'invalid x-api-key', new Headers()));
    const error = (await p.parse(request).catch((e: Error) => e)) as Error;
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).not.toContain('sk-ant');
    p.parseMock.mockRejectedValueOnce(Anthropic.APIError.generate(404, {}, 'model not found', new Headers()));
    await expect(p.parse(request)).rejects.toThrow('configured AI model is not available');
  });

  it('treats malformed or incomplete model output as invalid output, not a crash', async () => {
    const p = build();
    p.parseMock.mockResolvedValueOnce(ok({ parsed_output: null }));
    await expect(p.parse(request)).rejects.toBeInstanceOf(AiOutputInvalidError);
    p.parseMock.mockResolvedValueOnce(ok({ stop_reason: 'max_tokens' }));
    await expect(p.parse(request)).rejects.toBeInstanceOf(AiOutputInvalidError);
    p.parseMock.mockRejectedValueOnce(new SyntaxError('Unexpected token } in JSON'));
    await expect(p.parse(request)).rejects.toBeInstanceOf(AiOutputInvalidError);
  });

  it('maps a model refusal to a 422', async () => {
    const p = build();
    p.parseMock.mockResolvedValue(ok({ stop_reason: 'refusal' }));
    await expect(p.parse(request)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('fails clearly, without a request, when no API key is configured', async () => {
    const config = new ConfigService({});
    const p = new ClaudeProviderService(config, new ModelRouterService(config));
    await expect(p.parse(request)).rejects.toThrow('not configured');
  });
});
