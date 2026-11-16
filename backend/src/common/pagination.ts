import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  /** True when another page exists. We fetch one extra row to know this, so no COUNT query is needed. */
  hasMore: boolean;
}

export function pageArgs(query: PaginationQueryDto) {
  return { take: query.limit + 1, offset: (query.page - 1) * query.limit };
}

export function toPage<T>(rows: T[], query: PaginationQueryDto): Page<T> {
  return {
    items: rows.slice(0, query.limit),
    page: query.page,
    limit: query.limit,
    hasMore: rows.length > query.limit,
  };
}
