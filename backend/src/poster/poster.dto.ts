import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { LANGUAGES, type Language } from '../common/constants';
import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength } from 'class-validator';
import { TEMPLATES } from './poster-design';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

/** What every poster request says about the photo and the facts to use. Facts come from here or the product record, never from the AI. */
export class PosterBaseDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The photo to use: an upload or its Photo Studio version. Never modified. Give this or imageUrl.' })
  @IsOptional()
  @IsUUID()
  mediaId?: string;

  @ApiPropertyOptional({ description: 'The photo, by its URL. It must be one of your own uploads. Give this or mediaId.' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "The post this poster is for. Its headline and call to action are used, and the post's product price." })
  @IsOptional()
  @IsUUID()
  postId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'A saved product. Its price is the verified price.' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: '899', description: 'A price the owner typed. Overrides the product price. The AI never supplies a price.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[\s₹Rs.]*[\d,०-९]+(\.\d{1,2})?[\s/-]*$/, { message: 'price must be an amount such as 899 or ₹1,299' })
  @MaxLength(14)
  price?: string;

  @ApiPropertyOptional({ example: '20% OFF this week', description: 'An offer the owner typed. Required for the Offer Poster; shown word for word.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  offer?: string;

  @ApiPropertyOptional({ maxLength: 80, description: "Overrides the post's headline" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  headline?: string;

  @ApiPropertyOptional({ maxLength: 40, description: "Overrides the post's call to action" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  callToAction?: string;

  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;

  @ApiPropertyOptional({ default: true, description: "Gently enhance the photo with Gemini first (tidier background, product filling the frame). Your original is never changed. Needs Gemini to be set up; counts toward the daily AI allowance, and a photo is only ever enhanced once." })
  @IsOptional()
  @IsBoolean()
  enhance?: boolean;
}

export class GeneratePosterDto extends PosterBaseDto {
  @ApiPropertyOptional({ enum: TEMPLATES, description: 'Force a template. Otherwise Claude chooses from the photo.' })
  @IsOptional()
  @IsIn(TEMPLATES)
  template?: (typeof TEMPLATES)[number];
}

export class RenderPosterDto extends PosterBaseDto {
  @ApiProperty({ description: 'The complete design (see the design returned by /posters/generate). No AI call is made.' })
  @IsObject()
  design: Record<string, unknown>;
}

export class EditPosterDto extends RenderPosterDto {
  @ApiProperty({ maxLength: 300, example: 'Make the background warmer and add the price at the bottom-right' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  instruction: string;
}

export class SavePosterDto {
  @ApiProperty({ format: 'uuid', description: 'The post to attach this poster to (before approval)' })
  @IsUUID()
  postId: string;
}
