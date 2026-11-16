import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { LANGUAGES, type Language } from '../common/constants';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateBy } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

/** Metadata is small, free-form context (for example speech confidence). Capped so it can't grow without limit. */
const MAX_METADATA_BYTES = 4096;
const IsSmallMetadata = () =>
  ValidateBy({
    name: 'isSmallMetadata',
    validator: {
      validate: (value: unknown) => value === undefined || Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_METADATA_BYTES,
      defaultMessage: () => `metadata must be ${MAX_METADATA_BYTES} bytes or less`,
    },
  });

export class CreateMessageDto {
  @ApiProperty({ example: 'Ye cotton kurti hai, price 899 rupees', maxLength: 2000, description: 'Voice transcript or typed text' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ enum: LANGUAGES, description: 'Language of the transcript' })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;

  @ApiPropertyOptional({ description: 'Small context such as speech confidence or source (voice or text)' })
  @IsOptional()
  @IsObject()
  @IsSmallMetadata()
  metadata?: Record<string, unknown>;
}
