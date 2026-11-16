import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

const OWNER_BIZ = 'biz-1';

function build() {
  const rows = new Map<string, Record<string, unknown>>();
  const repository = {
    create: jest.fn(async (id: string, businessId: string, data: Record<string, unknown>) => {
      const row = { id, businessId, ...data };
      rows.set(id, row);
      return row;
    }),
    list: jest.fn(async () => [...rows.values()].slice(0, 3)),
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    update: jest.fn(async (id: string, data: Record<string, unknown>) => {
      const row = { ...rows.get(id)!, ...data };
      rows.set(id, row);
      return row;
    }),
    delete: jest.fn(async (id: string) => void rows.delete(id)),
  };
  const business = { primaryBusinessId: jest.fn().mockResolvedValue(OWNER_BIZ) };
  const service = new ProductsService(business as never, repository as never);
  return { service, repository, business, rows };
}

describe('ProductsService', () => {
  it('creates a product in the owner business with INR and available by default', async () => {
    const { service, repository } = build();
    const product = await service.create('user-1', { name: 'Cotton kurti', price: '899' });
    expect(product).toMatchObject({ businessId: OWNER_BIZ, name: 'Cotton kurti', price: '899', currency: 'INR', isAvailable: true });
    expect(repository.create).toHaveBeenCalled();
  });

  it('returns a page with hasMore based on one extra row', async () => {
    const { service, repository } = build();
    repository.list.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const page = await service.list('user-1', { page: 1, limit: 2 } as never);
    expect(page).toMatchObject({ page: 1, limit: 2, hasMore: true });
    expect(page.items).toHaveLength(2);
  });

  it('updates only the fields sent', async () => {
    const { service } = build();
    const created = await service.create('user-1', { name: 'Kurti', price: '899', category: 'kurti' });
    const updated = await service.update('user-1', created.id as string, { price: '799' });
    expect(updated).toMatchObject({ name: 'Kurti', category: 'kurti', price: '799' });
  });

  it("treats another owner's product as not found, for read, update and delete", async () => {
    const { service, business } = build();
    const created = await service.create('user-1', { name: 'Kurti' });
    business.primaryBusinessId.mockResolvedValue('other-biz');
    await expect(service.get('user-2', created.id as string)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('user-2', created.id as string, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('user-2', created.id as string)).rejects.toBeInstanceOf(NotFoundException);
  });
});
