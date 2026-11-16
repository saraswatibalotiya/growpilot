import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const PRODUCT_FIELDS = [
  'id',
  'businessId',
  'name',
  'description',
  'category',
  'price',
  'currency',
  'imageUrl',
  'isAvailable',
  'createdAt',
  'updatedAt',
] as const;

export interface ProductWrite {
  name?: string;
  description?: string | null;
  category?: string | null;
  price?: string | null;
  currency?: 'INR';
  imageUrl?: string | null;
  isAvailable?: boolean;
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get products() {
    return this.prisma.db.orm.public.Product;
  }

  create(id: string, businessId: string, data: ProductWrite & { name: string }) {
    return this.products.select(...PRODUCT_FIELDS).create({ id, businessId, ...data });
  }

  /** Newest first. Fetch one extra row so the caller can tell if another page exists. */
  list(businessId: string, filter: { isAvailable?: boolean }, take: number, offset: number) {
    const base = this.products.select(...PRODUCT_FIELDS).where({ businessId });
    const filtered = filter.isAvailable === undefined ? base : base.where({ isAvailable: filter.isAvailable });
    return filtered
      .orderBy((p) => p.createdAt.desc())
      .limit(take)
      .offset(offset)
      .all();
  }

  findById(id: string) {
    return this.products.select(...PRODUCT_FIELDS).where({ id }).first();
  }

  async update(id: string, data: ProductWrite) {
    await this.products.where({ id }).update(data);
    return this.findById(id);
  }

  async delete(id: string) {
    await this.products.where({ id }).delete();
  }
}
