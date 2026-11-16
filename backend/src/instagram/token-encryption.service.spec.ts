import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
  const service = new TokenEncryptionService(
    new ConfigService({
      INSTAGRAM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    }),
  );

  it('round-trips tokens with a new nonce for every encryption', () => {
    const first = service.encrypt('test-meta-token');
    const second = service.encrypt('test-meta-token');
    expect(first).not.toEqual(second);
    expect(first).not.toContain('test-meta-token');
    expect(service.decrypt(first)).toBe('test-meta-token');
  });

  it('rejects tampered authentication tags', () => {
    const parts = service.encrypt('test-meta-token').split('.');
    parts[2] = Buffer.alloc(16).toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });

  it('rejects missing encryption configuration', () => {
    const missing = new TokenEncryptionService(new ConfigService({}));
    expect(() => missing.encrypt('token')).toThrow();
  });
});