import { createHash } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  width: number | null;
  height: number | null;
  bytes: number;
}

/** Signed uploads via Cloudinary's REST API. Uses only Node built-ins, no SDK dependency. */
@Injectable()
export class CloudinaryClient {
  private readonly logger = new Logger(CloudinaryClient.name);

  constructor(private readonly config: ConfigService) {}

  private credentials() {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException('Image storage is not configured');
    }
    return { cloudName, apiKey, apiSecret };
  }

  async upload(buffer: Buffer, mimeType: string, folder: string, filename: string, resource: 'image' | 'video' = 'image'): Promise<CloudinaryUploadResult> {
    const { cloudName, apiKey, apiSecret } = this.credentials();
    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary signature: sorted params joined with &, plus the API secret, hashed with SHA-1.
    const toSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = createHash('sha1').update(toSign + apiSecret).digest('hex');

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature', signature);

    let response: Response;
    try {
      response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resource}/upload`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(resource === 'video' ? 120_000 : 30_000),
      });
    } catch {
      throw new BadGatewayException('Image storage did not respond; try again');
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || typeof json['public_id'] !== 'string') {
      // Log the status only; the body can echo parameters.
      this.logger.warn({ event: 'cloudinary_upload_failed', status: response.status });
      throw new BadGatewayException('Image upload failed; try again');
    }
    return {
      publicId: json['public_id'],
      secureUrl: String(json['secure_url']),
      width: typeof json['width'] === 'number' ? json['width'] : null,
      height: typeof json['height'] === 'number' ? json['height'] : null,
      bytes: Number(json['bytes'] ?? buffer.length),
    };
  }
}
