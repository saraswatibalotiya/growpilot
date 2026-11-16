import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CAPTION_LENGTHS, DEFAULT_CAPTION_LENGTH, DEFAULT_HASHTAG_LEVEL, HASHTAG_LEVELS, TONES, type CaptionLength, type HashtagLevel, type Tone } from '../common/constants';
import { Transform, type TransformFnParams } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { MAX_REEL_PHOTOS, ANIMATION_LEVELS, BACKGROUND_STYLES, MUSIC_TRACKS, REEL_DURATIONS, REEL_LANGUAGES, REEL_LOOKS, REEL_TEMPLATES, TEXT_STYLES, REGENERATE_PARTS, type RegeneratePart, type AnimationLevel, type BackgroundStyle, type MusicTrack, type ReelDuration, type ReelLanguage, type ReelLook, type ReelTemplate, type TextStyle } from './reels.constants';

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateReelDto {
  @ApiPropertyOptional({ description: 'A product of your business. Its name, price and photo are used unless you override them.' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'An uploaded photo of your business (from /media/upload).' })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @ApiPropertyOptional({ description: 'https URL of a photo you uploaded or a product image. Must belong to your business.' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_REEL_PHOTOS - 1, description: 'Up to four more uploaded photos (from /media/upload), shown in the middle scenes. The main photo is shown first and last.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REEL_PHOTOS - 1)
  @IsUUID(undefined, { each: true })
  extraMediaAssetIds?: string[];

  @ApiProperty({ enum: REEL_LANGUAGES })
  @IsIn(REEL_LANGUAGES)
  language: ReelLanguage;

  @ApiProperty({ enum: REEL_TEMPLATES })
  @IsIn(REEL_TEMPLATES)
  template: ReelTemplate;

  @ApiPropertyOptional({ enum: REEL_LOOKS, default: 'AI_ENHANCE', description: 'AI_ENHANCE (default when Gemini is set up): your own photo, gently tidied, with the product filling the screen. FULL_PHOTO: the free cut-out look. Other AI_*: an AI background scene around your unchanged product (uses the daily AI allowance; needs Gemini).' })
  @IsOptional()
  @IsIn(REEL_LOOKS)
  look?: ReelLook;

  @ApiPropertyOptional({ enum: BACKGROUND_STYLES, default: 'WHITE_STUDIO', description: 'Studio backdrop behind the product.' })
  @IsOptional()
  @IsIn(BACKGROUND_STYLES)
  backgroundStyle?: BackgroundStyle;

  @ApiPropertyOptional({ enum: ANIMATION_LEVELS, default: 'BALANCED', description: 'How much the camera, product and text move.' })
  @IsOptional()
  @IsIn(ANIMATION_LEVELS)
  animationLevel?: AnimationLevel;

  @ApiPropertyOptional({ enum: TEXT_STYLES, default: 'CLASSIC', description: 'Typography: CLASSIC (serif), MODERN (clean sans), BOLD (heavy).' })
  @IsOptional()
  @IsIn(TEXT_STYLES)
  textStyle?: TextStyle;

  @ApiPropertyOptional({ enum: MUSIC_TRACKS, default: 'NONE', description: 'Royalty-free background music, quieter while the voice speaks.' })
  @IsOptional()
  @IsIn(MUSIC_TRACKS)
  music?: MusicTrack;

  @ApiPropertyOptional({ enum: REEL_DURATIONS, default: 10, description: 'Reel length in seconds.' })
  @IsOptional()
  @IsIn(REEL_DURATIONS)
  durationSeconds?: ReelDuration;

  @ApiPropertyOptional({ maxLength: 300, description: 'A short wish, for example "mention it is good for weddings". Facts in it are used as given.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  instruction?: string;

  @ApiProperty({ enum: TONES, description: 'The writing tone the owner picked for this reel. There is no default.' })
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

  @ApiPropertyOptional({ maxLength: 120, description: 'Required when no productId is given.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  productName?: string;

  @ApiPropertyOptional({ example: '899', description: 'Shown only if you send it (or the product has one).' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  price?: string;

  @ApiPropertyOptional({ maxLength: 80, description: 'Your own offer words, shown exactly as typed.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  offerText?: string;
}

/** Only the fields sent change. An empty string clears price, offerText or instruction. */
export class UpdateReelDto {
  @ApiPropertyOptional({ maxLength: 600, description: 'The voiceover text. Changing it re-makes the voice and the video.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(600)
  script?: string;

  @ApiPropertyOptional({ maxLength: 2200, description: 'Caption only: nothing is re-rendered.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 15, description: 'Hashtags only: nothing is re-rendered.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  hashtags?: string[];

  @ApiPropertyOptional({ enum: REEL_LANGUAGES, description: 'Changing it needs a new script, voice and video.' })
  @IsOptional()
  @IsIn(REEL_LANGUAGES)
  language?: ReelLanguage;

  @ApiPropertyOptional({ enum: REEL_TEMPLATES, description: 'Changing it re-renders the video (the voice is kept).' })
  @IsOptional()
  @IsIn(REEL_TEMPLATES)
  template?: ReelTemplate;

  @ApiPropertyOptional({ enum: REEL_LOOKS, description: 'Changing it re-renders the video (the voice is kept).' })
  @IsOptional()
  @IsIn(REEL_LOOKS)
  look?: ReelLook;

  @ApiPropertyOptional({ enum: BACKGROUND_STYLES, default: 'WHITE_STUDIO', description: 'Studio backdrop behind the product. Changing it re-renders the video only.' })
  @IsOptional()
  @IsIn(BACKGROUND_STYLES)
  backgroundStyle?: BackgroundStyle;

  @ApiPropertyOptional({ enum: ANIMATION_LEVELS, default: 'BALANCED', description: 'How much the camera, product and text move. Changing it re-renders the video only.' })
  @IsOptional()
  @IsIn(ANIMATION_LEVELS)
  animationLevel?: AnimationLevel;

  @ApiPropertyOptional({ enum: TEXT_STYLES, default: 'CLASSIC', description: 'Typography: CLASSIC (serif), MODERN (clean sans), BOLD (heavy). Changing it re-renders the video only.' })
  @IsOptional()
  @IsIn(TEXT_STYLES)
  textStyle?: TextStyle;

  @ApiPropertyOptional({ enum: MUSIC_TRACKS, default: 'NONE', description: 'Royalty-free background music, quieter while the voice speaks. Changing it re-renders the video only.' })
  @IsOptional()
  @IsIn(MUSIC_TRACKS)
  music?: MusicTrack;

  @ApiPropertyOptional({ enum: REEL_DURATIONS, default: 10, description: 'Reel length in seconds. Changing it needs a new script, voice and video.' })
  @IsOptional()
  @IsIn(REEL_DURATIONS)
  durationSeconds?: ReelDuration;

  @ApiPropertyOptional({ enum: TONES, description: 'The writing tone the owner picked for this reel.' })
  @IsOptional()
  @IsIn(TONES)
  tone?: Tone;

  @ApiPropertyOptional({ enum: CAPTION_LENGTHS, default: DEFAULT_CAPTION_LENGTH })
  @IsOptional()
  @IsIn(CAPTION_LENGTHS)
  captionLength?: CaptionLength;

  @ApiPropertyOptional({ enum: HASHTAG_LEVELS, default: DEFAULT_HASHTAG_LEVEL })
  @IsOptional()
  @IsIn(HASHTAG_LEVELS)
  hashtagLevel?: HashtagLevel;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  instruction?: string;

  @ApiPropertyOptional({ maxLength: 120, description: 'On-screen text changes: the video is re-rendered.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  productName?: string;

  @ApiPropertyOptional({ example: '899', description: 'On-screen text changes: the video is re-rendered.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  price?: string;

  @ApiPropertyOptional({ maxLength: 80, description: 'On-screen text changes: the video is re-rendered.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  offerText?: string;
}

export class RegenerateReelDto {
  @ApiProperty({ enum: REGENERATE_PARTS, description: 'script: new script, voice and video. voice: new voice and video. video: render only. all: same as script.' })
  @IsIn(REGENERATE_PARTS)
  part: RegeneratePart;

  @ApiPropertyOptional({ description: 'With part script/all: write a clearly shorter script.' })
  @IsOptional()
  @IsBoolean()
  shorter?: boolean;

  @ApiPropertyOptional({ enum: TONES, description: 'The writing tone the owner picked for this reel.' })
  @IsOptional()
  @IsIn(TONES)
  tone?: Tone;

  @ApiPropertyOptional({ enum: CAPTION_LENGTHS, default: DEFAULT_CAPTION_LENGTH })
  @IsOptional()
  @IsIn(CAPTION_LENGTHS)
  captionLength?: CaptionLength;

  @ApiPropertyOptional({ enum: HASHTAG_LEVELS, default: DEFAULT_HASHTAG_LEVEL })
  @IsOptional()
  @IsIn(HASHTAG_LEVELS)
  hashtagLevel?: HashtagLevel;
}

export class PublishReelDto {
  @ApiProperty({ example: true, description: 'Must be true. It records that the owner pressed "Approve and publish".' })
  @Equals(true, { message: 'confirm must be true: the owner has to explicitly approve publishing' })
  confirm: boolean;
}
