import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PRODUCT_CATEGORIES } from './enhance-profiles';
import { VISUAL_STYLES } from './image-editing.provider';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);
const FORMATS = ['portrait', 'square'] as const;

export class AnalyzeMediaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mediaId: string;

  @ApiPropertyOptional({ default: true, description: 'false skips Claude and returns only the free, built-in quality check' })
  @IsOptional()
  @IsBoolean()
  useAi?: boolean;

  @ApiPropertyOptional({ description: 'Ignore a stored analysis and ask Claude again (costs tokens)' })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}

export class EnhanceMediaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mediaId: string;

  @ApiProperty({ enum: ['quick', 'clean'], description: 'quick: exposure, colour, crop, sharpen. clean: quick plus an even background.' })
  @IsIn(['quick', 'clean'])
  mode: 'quick' | 'clean';

  @ApiPropertyOptional({ enum: FORMATS, default: 'portrait', description: 'portrait is 1080x1350 (4:5), square is 1080x1080' })
  @IsOptional()
  @IsIn(FORMATS)
  format?: (typeof FORMATS)[number];

  @ApiPropertyOptional({ enum: PRODUCT_CATEGORIES, description: 'Defaults to the category found by /media/analyze, else general' })
  @IsOptional()
  @IsIn(PRODUCT_CATEGORIES)
  category?: string;
}

export class AiEditMediaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mediaId: string;

  @ApiPropertyOptional({ enum: FORMATS, default: 'portrait' })
  @IsOptional()
  @IsIn(FORMATS)
  format?: (typeof FORMATS)[number];

  @ApiPropertyOptional({ enum: PRODUCT_CATEGORIES })
  @IsOptional()
  @IsIn(PRODUCT_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({
    enum: VISUAL_STYLES,
    default: 'lighting_only',
    description: 'lighting_only improves light and shadows on the existing photo. Any other style generates a new background scene around the unchanged product.',
  })
  @IsOptional()
  @IsIn(VISUAL_STYLES)
  style?: (typeof VISUAL_STYLES)[number];

  @ApiPropertyOptional({ default: false, description: 'Use the premium image model (GEMINI_IMAGE_PREMIUM_MODEL). Costs more.' })
  @IsOptional()
  @IsBoolean()
  premium?: boolean;

  @ApiPropertyOptional({ description: 'Run even when the analysis did not recommend AI editing' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  instructions?: string;
}
