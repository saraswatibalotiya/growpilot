import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { correlationId } from './ai-engine.controller';

const req = (value?: string | string[]) => ({ headers: { 'x-request-id': value } }) as unknown as AuthenticatedRequest;

describe('correlationId', () => {
  it('keeps a safe id from the caller', () => {
    expect(correlationId(req('abc-12345678'))).toBe('abc-12345678');
  });
  it('replaces a missing or unsafe one', () => {
    for (const bad of [undefined, 'short', 'has spaces in it', 'x'.repeat(80), 'a\r\nInjected: 1']) expect(correlationId(req(bad))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
