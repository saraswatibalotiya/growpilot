import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessRepository, type BusinessProfileWrite } from './business.repository';
import type { CreateBusinessProfileDto, UpdateBusinessProfileDto } from './business.dto';

const NO_PROFILE = 'No business profile yet. Create one first.';

@Injectable()
export class BusinessService {
  constructor(private readonly repository: BusinessRepository) {}

  async getProfile(userId: string) {
    const business = await this.repository.findPrimaryForUser(userId);
    if (!business) throw new NotFoundException(NO_PROFILE);
    return business;
  }

  /**
   * The owner's primary business id, taken from the authenticated user, never from the request body.
   * Other modules use this to scope every query to the owner's business.
   */
  async primaryBusinessId(userId: string): Promise<string> {
    return (await this.getProfile(userId)).id;
  }

  async createProfile(userId: string, dto: CreateBusinessProfileDto) {
    if (await this.repository.findPrimaryForUser(userId)) {
      throw new ConflictException('A business profile already exists; update it instead');
    }
    return this.repository.create(randomUUID(), userId, {
      name: dto.name,
      category: dto.category,
      preferredLanguage: dto.preferredLanguage ?? null,
      supportedLanguages: dto.supportedLanguages ?? null,
      description: dto.description ?? null,
      city: dto.city ?? null,
      area: dto.area ?? null,
      targetAudience: dto.targetAudience ?? null,
    });
  }

  async updateProfile(userId: string, dto: UpdateBusinessProfileDto) {
    const business = await this.getProfile(userId);
    // Only fields the client sent change; omitted fields keep their stored value.
    const data: BusinessProfileWrite = {};
    for (const key of ['name', 'category', 'preferredLanguage', 'supportedLanguages', 'description', 'city', 'area', 'targetAudience'] as const) {
      if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key];
    }
    if (Object.keys(data).length === 0) return business;
    return this.repository.update(business.id, userId, data);
  }
}
