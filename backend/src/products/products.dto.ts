import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

/** Decimal money as a string, e.g. "899" or "899.50". Strings avoid floating-point rounding. */
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export class CreateProductDto {
  @ApiProperty({ example: 'Cotton kurti', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 80, example: 'kurti' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ example: '899.00', description: 'Decimal string, up to 2 decimal places' })
  @IsOptional()
  @Matches(PRICE_PATTERN, { message: 'price must be a decimal string such as "899" or "899.50"' })
  price?: string;

  @ApiPropertyOptional({ enum: ['INR'], default: 'INR' })
  @IsOptional()
  @IsIn(['INR'])
  currency?: 'INR';

  @ApiPropertyOptional({ description: 'Public https URL of the product photo (for example from /media/upload)' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'imageUrl must be an https URL' })
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ example: '799.00' })
  @IsOptional()
  @Matches(PRICE_PATTERN, { message: 'price must be a decimal string such as "899" or "899.50"' })
  price?: string;

  @ApiPropertyOptional({ enum: ['INR'] })
  @IsOptional()
  @IsIn(['INR'])
  currency?: 'INR';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'imageUrl must be an https URL' })
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by availability (true or false)' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isAvailable?: boolean;
}
