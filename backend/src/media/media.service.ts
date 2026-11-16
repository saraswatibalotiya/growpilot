import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { BusinessRepository } from '../business/business.repository';
import { CloudinaryClient } from './cloudinary.client';
import { MediaRepository } from './media.repository';
import { detectImage } from './image-signature';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Injectable()
export class MediaService {
  constructor(
    private readonly businesses: BusinessService,
    private readonly businessRepository: BusinessRepository,
    private readonly repository: MediaRepository,
    private readonly cloudinary: CloudinaryClient,
  ) {}

  async upload(userId: string, file: { buffer: Buffer; size: number; originalname?: string } | undefined) {
    if (!file || file.size === 0) throw new BadRequestException('Attach an image in the "file" field');
    if (file.size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException('Image must be 10 MB or smaller');

    const detected = detectImage(file.buffer);
    if (!detected) throw new UnsupportedMediaTypeException('Upload a JPEG, PNG, WEBP or HEIC image');

    const business = await this.businesses.getProfile(userId);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    // The same picture again is not stored twice: the earlier upload (and its URL) is returned.
    const existing = await this.repository.findByHash(business.id, sha256);
    if (existing) return existing;
    const folder = `growpilot/${business.id}`;
    const stored = await this.cloudinary.upload(file.buffer, detected.mimeType, folder, `product.${detected.extension}`);

    return this.repository.create(randomUUID(), {
      businessId: business.id,
      cloudinaryPublicId: stored.publicId,
      secureUrl: stored.secureUrl,
      mimeType: detected.mimeType,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      sha256,
    });
  }

  /** Only the owner of the asset's business can read it. Other owners get the same 404. */
  async get(userId: string, mediaId: string) {
    const asset = await this.repository.findById(mediaId);
    if (!asset) throw new NotFoundException('Media not found');
    const owned = await this.businessRepository.findPrimaryForUser(userId);
    if (!owned || owned.id !== asset.businessId) throw new NotFoundException('Media not found');
    return asset;
  }
}
