import type { ConfigService } from '@nestjs/config';
import { AiEngineClient, AiEngineError } from './ai-engine.client';

const TOKEN = 'service-token-SECRET';

function config(values: Record<string, string> = {}): ConfigService {
  const all: Record<string, string> = { AI_ENGINE_ENABLED: 'true', AI_ENGINE_URL: 'http://engine.internal:8001/', AI_ENGINE_SERVICE_TOKEN: TOKEN, AI_ENGINE_BREAKER_THRESHOLD: '3', ...values };
  return { get: (key: string) => all[key] } as unknown as ConfigService;
}

const ok = (data: unknown) => new Response(JSON.stringify({ data, meta: { request_id: 'x' } }), { status: 200 });
const fail = (status: number, code = 'x', message = 'm') => new Response(JSON.stringify({ error: { code, message } }), { status });

function build(values?: Record<string, string>) {
  const client = new AiEngineClient(config(values));
  const fetchFn = jest.fn();
  client.fetchFn = fetchFn as never;
  client.sleep = async () => undefined;
  return { client, fetchFn };
}

const get = { method: 'GET', path: '/profiles/p1', requestId: 'req-12345678', idempotent: true } as const;

describe('AiEngineClient', () => {
  it('does nothing when the engine is turned off', async () => {
    const { client, fetchFn } = build({ AI_ENGINE_ENABLED: 'false' });
    await expect(client.call(get)).rejects.toMatchObject({ kind: 'disabled' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends the service token and correlation id, and returns the data', async () => {
    const { client, fetchFn } = build();
    fetchFn.mockResolvedValue(ok({ a: 1 }));
    await expect(client.call({ ...get, query: { profile_id: 'p1', skip: undefined } })).resolves.toEqual({ a: 1 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('http://engine.internal:8001/api/v1/profiles/p1?profile_id=p1');
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TOKEN}`, 'x-request-id': 'req-12345678' });
    expect(init.redirect).toBe('error');
  });

  it('retries safe calls on connection failures, then succeeds', async () => {
    const { client, fetchFn } = build();
    fetchFn.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok(1));
    await expect(client.call(get)).resolves.toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured retries', async () => {
    const { client, fetchFn } = build({ AI_ENGINE_MAX_RETRIES: '1' });
    fetchFn.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.call(get)).rejects.toMatchObject({ kind: 'unreachable' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('never retries a call that is not safe to repeat', async () => {
    const { client, fetchFn } = build();
    fetchFn.mockResolvedValue(fail(503));
    await expect(client.call({ method: 'POST', path: '/recommendations/generate', body: {}, requestId: 'req-12345678' })).rejects.toMatchObject({ kind: 'unavailable' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('reports a timeout', async () => {
    const { client, fetchFn } = build({ AI_ENGINE_MAX_RETRIES: '0' });
    fetchFn.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(client.call(get)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'invalid_request'],
    [500, 'unavailable'],
  ])('maps HTTP %i to %s and does not retry it', async (status, kind) => {
    const { client, fetchFn } = build();
    fetchFn.mockResolvedValue(fail(status));
    await expect(client.call(get)).rejects.toMatchObject({ kind });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('separates an AI wording failure from the engine being down', async () => {
    const { client, fetchFn } = build();
    fetchFn.mockResolvedValue(fail(502, 'ai_provider_error'));
    await expect(client.call({ method: 'POST', path: '/x', body: {}, requestId: 'req-12345678' })).rejects.toMatchObject({ kind: 'ai_provider' });
  });

  it('treats a 200 without data as a bad response', async () => {
    const { client, fetchFn } = build();
    fetchFn.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(client.call(get)).rejects.toMatchObject({ kind: 'bad_response' });
  });

  it('never puts the token in an error', async () => {
    const { client, fetchFn } = build();
    fetchFn.mockResolvedValue(fail(401, 'unauthorized', `bad ${TOKEN}`));
    const error = (await client.call(get).catch((e: unknown) => e)) as AiEngineError;
    expect(JSON.stringify({ m: error.message, k: error.kind })).not.toContain(TOKEN);
  });

  it('opens a circuit after repeated connection failures, then closes it after the cooldown', async () => {
    const { client, fetchFn } = build({ AI_ENGINE_MAX_RETRIES: '0', AI_ENGINE_BREAKER_COOLDOWN_MS: '5000' });
    let now = 1_000_000;
    client.now = () => now;
    fetchFn.mockRejectedValue(new TypeError('fetch failed'));
    for (let i = 0; i < 3; i++) await client.call(get).catch(() => undefined);
    fetchFn.mockClear();
    await expect(client.call(get)).rejects.toMatchObject({ kind: 'circuit_open' });
    expect(fetchFn).not.toHaveBeenCalled();
    now += 5_001;
    fetchFn.mockResolvedValue(ok(1));
    await expect(client.call(get)).resolves.toBe(1);
  });

  it('does not count an engine that answers with an error as down', async () => {
    const { client, fetchFn } = build({ AI_ENGINE_MAX_RETRIES: '0' });
    fetchFn.mockResolvedValue(fail(404));
    for (let i = 0; i < 6; i++) await expect(client.call(get)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('health probe never throws', async () => {
    const { client, fetchFn } = build();
    fetchFn.mockRejectedValue(new TypeError('x'));
    await expect(client.isHealthy('req-12345678')).resolves.toBe(false);
    fetchFn.mockResolvedValue(ok({ status: 'ok' }));
    await expect(client.isHealthy('req-12345678')).resolves.toBe(true);
  });

  it('falls back to the default address when the URL is malformed', () => {
    expect(build({ AI_ENGINE_URL: 'not a url' }).client.config.baseUrl).toBe('http://127.0.0.1:8001');
  });
});
