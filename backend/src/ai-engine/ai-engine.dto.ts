import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const OBJECTIVES = ['REACH', 'ENGAGEMENT', 'SAVES', 'SHARES', 'PRODUCT_DISCOVERY', 'LEADS', 'SALES', 'COMMUNITY_BUILDING', 'AUDIENCE_EDUCATION', 'BRAND_AWARENESS'] as const;
export const FEEDBACK_ACTIONS = ['SAVED', 'DISMISSED', 'LIKED', 'NOT_RELEVANT', 'ALREADY_POSTED', 'CREATED', 'PUBLISHED'] as const;
export const OUTCOME_INTERVALS = ['INITIAL', 'H24', 'H72', 'D7'] as const;
export const MOCK_INDUSTRIES = ['fashion', 'grooming', 'beauty', 'cafe'] as const;

export class MockPreviewDto {
  @ApiProperty({ enum: MOCK_INDUSTRIES })
  @IsIn(MOCK_INDUSTRIES)
  industry: (typeof MOCK_INDUSTRIES)[number];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

/** There is deliberately no business or profile id in any of these: the owner is always the signed-in user. */
export class GenerateRecommendationsDto {
  @ApiPropertyOptional({ minimum: 3, maximum: 5, default: 4 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(5)
  count?: number;

  @ApiPropertyOptional({ enum: OBJECTIVES, description: 'Overrides the business goal for this request' })
  @IsOptional()
  @IsIn(OBJECTIVES)
  goal?: (typeof OBJECTIVES)[number];

  @ApiPropertyOptional({ default: false, description: 'Let the AI provider polish the wording. Scores and evidence stay rule-based.' })
  @IsOptional()
  @IsBoolean()
  useAi?: boolean;
}

export class FeedbackDto {
  @ApiProperty({ enum: FEEDBACK_ACTIONS })
  @IsIn(FEEDBACK_ACTIONS)
  action: (typeof FEEDBACK_ACTIONS)[number];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class MockFeedbackDto extends FeedbackDto {
  @ApiProperty({ enum: MOCK_INDUSTRIES })
  @IsIn(MOCK_INDUSTRIES)
  industry: (typeof MOCK_INDUSTRIES)[number];
}

export class OutcomeMetricsDto {
  @IsOptional() @IsInt() @Min(0) views?: number;
  @IsOptional() @IsInt() @Min(0) reach?: number;
  @IsOptional() @IsInt() @Min(0) likes?: number;
  @IsOptional() @IsInt() @Min(0) comments?: number;
  @IsOptional() @IsInt() @Min(0) shares?: number;
  @IsOptional() @IsInt() @Min(0) saves?: number;
}

export class OutcomeDto {
  @ApiProperty({ enum: OUTCOME_INTERVALS })
  @IsIn(OUTCOME_INTERVALS)
  interval: (typeof OUTCOME_INTERVALS)[number];

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  instagramMediaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @ApiProperty({ description: 'Only metrics that were actually available. Leave out what is unknown; do not send zero for it.' })
  @IsObject()
  @ValidateNested()
  @Type(() => OutcomeMetricsDto)
  metrics: OutcomeMetricsDto;
}
