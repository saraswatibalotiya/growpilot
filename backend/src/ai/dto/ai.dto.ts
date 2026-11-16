import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { CAPTION_LENGTHS, DEFAULT_CAPTION_LENGTH, DEFAULT_HASHTAG_LEVEL, HASHTAG_LEVELS, LANGUAGES, TONES, type CaptionLength, type HashtagLevel, type Language, type Tone } from '../../common/constants';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

export class ClassifyIntentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  conversationId: string;

  @ApiProperty({ maxLength: 2000, example: 'New cotton kurtis aaye hain. Ek attractive post banao.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  transcript: string;
}

export class GenerateContentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  conversationId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'A saved product; its price and name are used as verified facts' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A draft post to save the content into. The post moves to PREVIEW_READY. Nothing is ever published here.',
  })
  @IsOptional()
  @IsUUID()
  postId?: string;

  @ApiPropertyOptional({ description: 'A photo uploaded through /media/upload (https, our Cloudinary storage only)' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;

  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  transcript: string;

  @ApiPropertyOptional({ enum: LANGUAGES, description: "Defaults to the shop's preferred language, then to the language of the transcript" })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;

  @ApiProperty({ enum: TONES, description: 'The writing tone the owner picked for this post.' })
  @IsIn(TONES)
  tone: Tone;

  @ApiPropertyOptional({ enum: CAPTION_LENGTHS, default: DEFAULT_CAPTION_LENGTH })
  @IsOptional()
  @IsIn(CAPTION_LENGTHS)
  captionLength?: CaptionLength;

  @ApiPropertyOptional({ enum: HASHTAG_LEVELS, default: DEFAULT_HASHTAG_LEVEL })
  @IsOptional()
  @IsIn(HASHTAG_LEVELS)
  hashtagLevel?: HashtagLevel;
}

export class EditContentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  conversationId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  postId: string;

  @ApiProperty({ maxLength: 1000, example: 'Make it shorter and use Marathi. Remove the price.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  instruction: string;
}
