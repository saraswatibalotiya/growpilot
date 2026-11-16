import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { LANGUAGES, ONBOARDING_CATEGORIES, type Language, type OnboardingCategory } from '../common/constants';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateBusinessProfileDto {
  @ApiProperty({ example: 'Sukoon Sole', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: ONBOARDING_CATEGORIES, description: 'Shop category' })
  @IsIn(ONBOARDING_CATEGORIES)
  category: OnboardingCategory;

  @ApiPropertyOptional({ enum: LANGUAGES, description: 'hi = Hindi, mr = Marathi, en = English' })
  @IsOptional()
  @IsIn(LANGUAGES)
  preferredLanguage?: Language;

  @ApiPropertyOptional({ type: [String], enum: LANGUAGES })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(LANGUAGES, { each: true })
  supportedLanguages?: Language[];

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
  city?: string;

  @ApiPropertyOptional({ maxLength: 80, description: 'Neighbourhood or area' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  area?: string;

  @ApiPropertyOptional({ maxLength: 300, example: 'Women aged 20-35 in Andheri' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  targetAudience?: string;
}

export class UpdateBusinessProfileDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ONBOARDING_CATEGORIES })
  @IsOptional()
  @IsIn(ONBOARDING_CATEGORIES)
  category?: OnboardingCategory;

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  preferredLanguage?: Language;

  @ApiPropertyOptional({ type: [String], enum: LANGUAGES })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(LANGUAGES, { each: true })
  supportedLanguages?: Language[];

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
  city?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  area?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  targetAudience?: string;
}

export class BusinessProfileResponse {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'clothing, jewellery or grocery for new profiles; older rows may hold other values' })
  category: string;
  @ApiProperty({ enum: LANGUAGES, nullable: true }) preferredLanguage: string | null;
  @ApiProperty({ type: [String], nullable: true }) supportedLanguages: string[] | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) city: string | null;
  @ApiProperty({ nullable: true }) area: string | null;
  @ApiProperty({ nullable: true }) targetAudience: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
