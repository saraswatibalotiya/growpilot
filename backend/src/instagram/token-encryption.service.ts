import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenEncryptionService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plaintext: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), nonce);
    cipher.setAAD(Buffer.from('growpilot:meta-token:v1'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return ['v1', nonce, cipher.getAuthTag(), ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(envelope: string): string {
    const [version, nonce, tag, ciphertext, extra] = envelope.split('.');
    if (version !== 'v1' || !nonce || !tag || !ciphertext || extra) {
      throw new Error('Invalid encrypted token envelope');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(nonce, 'base64url'),
    );
    decipher.setAAD(Buffer.from('growpilot:meta-token:v1'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(): Buffer {
    const encoded = this.config.get<string>('INSTAGRAM_TOKEN_ENCRYPTION_KEY');
    if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
      throw new ServiceUnavailableException(
        'INSTAGRAM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
      );
    }
    return Buffer.from(encoded, 'base64');
  }
}