import { ConflictException, NotFoundException } from '@nestjs/common';
import type { BusinessRepository } from './business.repository';
import { BusinessService } from './business.service';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

class FakeRepo {
  rows: Array<Record<string, unknown> & { id: string; userId: string }> = [];
  findPrimaryForUser = jest.fn(async (userId: string) => this.rows.find((r) => r.userId === userId) ?? null);
  create = jest.fn(async (id: string, userId: string, data: Record<string, unknown>) => {
    const row = { id, userId, createdAt: new Date(), updatedAt: new Date(), ...data };
    this.rows.push(row as never);
    return row;
  });
  update = jest.fn(async (id: string, userId: string, data: Record<string, unknown>) => {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row) return null;
    Object.assign(row, data);
    return row;
  });
}

function build() {
  const repo = new FakeRepo();
  return { service: new BusinessService(repo as unknown as BusinessRepository), repo };
}

describe('BusinessService', () => {
  it('returns 404 when the owner has no profile yet', async () => {
    const { service } = build();
    await expect(service.getProfile(OWNER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a profile with the onboarding fields', async () => {
    const { service, repo } = build();
    const created = await service.createProfile(OWNER, {
      name: 'Sukoon Sole',
      category: 'clothing',
      preferredLanguage: 'hi',
      city: 'Mumbai',
      area: 'Andheri',
    });
    expect(created).toMatchObject({ name: 'Sukoon Sole', category: 'clothing', preferredLanguage: 'hi', city: 'Mumbai', area: 'Andheri' });
    expect(repo.rows).toHaveLength(1);
  });

  it('refuses a second profile for the same owner', async () => {
    const { service } = build();
    await service.createProfile(OWNER, { name: 'A', category: 'grocery' });
    await expect(service.createProfile(OWNER, { name: 'B', category: 'grocery' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates only the fields sent and keeps the others', async () => {
    const { service } = build();
    await service.createProfile(OWNER, { name: 'Shop', category: 'clothing', city: 'Mumbai', preferredLanguage: 'mr' });
    const updated = await service.updateProfile(OWNER, { preferredLanguage: 'en' });
    expect(updated).toMatchObject({ name: 'Shop', city: 'Mumbai', preferredLanguage: 'en' });
  });

  it('can clear an optional field by sending null', async () => {
    const { service } = build();
    await service.createProfile(OWNER, { name: 'Shop', category: 'clothing', city: 'Pune' });
    const updated = await service.updateProfile(OWNER, { city: null as unknown as string });
    expect(updated).toMatchObject({ city: null });
  });

  it("never reads or changes another owner's profile", async () => {
    const { service } = build();
    await service.createProfile(OWNER, { name: 'Owner shop', category: 'clothing' });
    await expect(service.getProfile(OTHER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateProfile(OTHER, { name: 'Hijack' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
