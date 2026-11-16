import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { pageArgs, toPage, type Page } from '../common/pagination';
import type { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './products.dto';
import { ProductsRepository, type ProductWrite } from './products.repository';

type ProductRow = { id: string; businessId: string };

@Injectable()
export class ProductsService {
  constructor(
    private readonly business: BusinessService,
    private readonly repository: ProductsRepository,
  ) {}

  async create(userId: string, dto: CreateProductDto) {
    const businessId = await this.business.primaryBusinessId(userId);
    return this.repository.create(randomUUID(), businessId, {
      name: dto.name,
      description: dto.description ?? null,
      category: dto.category ?? null,
      price: dto.price ?? null,
      currency: dto.currency ?? 'INR',
      imageUrl: dto.imageUrl ?? null,
      isAvailable: dto.isAvailable ?? true,
    });
  }

  async list(userId: string, query: ListProductsQueryDto): Promise<Page<unknown>> {
    const businessId = await this.business.primaryBusinessId(userId);
    const { take, offset } = pageArgs(query);
    const rows = await this.repository.list(businessId, { isAvailable: query.isAvailable }, take, offset);
    return toPage(rows, query);
  }

  async get(userId: string, id: string) {
    return this.owned(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateProductDto) {
    await this.owned(userId, id);
    const data: ProductWrite = {};
    for (const key of ['name', 'description', 'category', 'price', 'currency', 'imageUrl', 'isAvailable'] as const) {
      if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key];
    }
    return this.repository.update(id, data);
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.repository.delete(id);
  }

  /** Loads a product only if it belongs to the caller's business. Otherwise it looks missing, which avoids leaking ids. */
  private async owned(userId: string, id: string) {
    const businessId = await this.business.primaryBusinessId(userId);
    const product = (await this.repository.findById(id)) as ProductRow | null;
    if (!product || product.businessId !== businessId) throw new NotFoundException('Product not found');
    return product;
  }
}
