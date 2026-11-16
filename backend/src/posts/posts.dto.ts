import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import { LANGUAGES, type Language } from '../common/constants';
import { POST_STATUSES, type PostStatus } from './posts.state';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

const httpsUrl = (message: string) => IsUrl({ protocols: ['https'], require_protocol: true }, { message });

/** Instagram carousels hold up to 10 photos. The first is the cover. */
export const MAX_CAROUSEL_IMAGES = 10;

export class CreatePostDto {
  @ApiPropertyOptional({ description: 'Photos for the carousel, in order (1 to 10). Each must be an upload from /media/upload. The first is the cover.', type: [String], maxItems: MAX_CAROUSEL_IMAGES })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CAROUSEL_IMAGES)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true, message: 'each imageUrls entry must be an https URL' })
  @MaxLength(2048, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ description: 'Single cover photo. Use imageUrls for a carousel. If both are sent, imageUrls wins.' })
  @IsOptional()
  @httpsUrl('originalImageUrl must be an https URL')
  @MaxLength(2048)
  originalImageUrl?: string;

  @ApiPropertyOptional({ description: 'Product this post is about (must belong to your business)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Conversation that produced this post (must belong to your business)' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  headline?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  callToAction?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 15 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;

  @ApiPropertyOptional({ description: 'Rendered poster URL (https)' })
  @IsOptional()
  @httpsUrl('posterImageUrl must be an https URL')
  @MaxLength(2048)
  posterImageUrl?: string;
}

/** Clients may approve (PREVIEW_READY -> USER_APPROVED) or reopen an approved draft. Other status changes happen on the server. */
export class UpdatePostDto {
  @ApiPropertyOptional({ description: 'Replaces the carousel (1 to 10 uploads, in order). Only before approval.', type: [String], maxItems: MAX_CAROUSEL_IMAGES })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CAROUSEL_IMAGES)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true, message: 'each imageUrls entry must be an https URL' })
  @MaxLength(2048, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  headline?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  callToAction?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 15 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @httpsUrl('posterImageUrl must be an https URL')
  @MaxLength(2048)
  posterImageUrl?: string;

  @ApiPropertyOptional({ enum: ['USER_APPROVED', 'PREVIEW_READY'], description: 'USER_APPROVED approves a preview. PREVIEW_READY reopens an approved (not yet published) draft so it can be edited; it then needs approving again.' })
  @IsOptional()
  @IsIn(['USER_APPROVED', 'PREVIEW_READY'])
  status?: Extract<PostStatus, 'USER_APPROVED' | 'PREVIEW_READY'>;
}

export class ListPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: POST_STATUSES })
  @IsOptional()
  @IsIn(POST_STATUSES)
  status?: PostStatus;
}

