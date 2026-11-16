import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const INSIGHT_METRICS = [
  'reach',
  'views',
  'profile_views',
  'accounts_engaged',
  'total_interactions',
  'likes',
  'comments',
  'shares',
  'saves',
] as const;

export class ConnectQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Business the Instagram account will be attached to' })
  @IsUUID()
  businessId: string;
}

export class CallbackQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) error?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) error_reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) error_description?: string;
}

export class ListAccountsQueryDto extends ConnectQueryDto {}

export class ConnectWithTokenDto extends ConnectQueryDto {
  @ApiProperty({
    writeOnly: true,
    description: 'Instagram user access token from Meta dashboard → Instagram API → Generate token',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(1024)
  @Matches(/^[A-Za-z0-9_\-|.]+$/)
  accessToken: string;

  @ApiPropertyOptional({
    example: '17841480896472756',
    description: 'Instagram account ID shown under the account on the Meta dashboard. Verified with the token.',
  })
  @IsOptional()
  @Matches(/^\d{5,30}$/)
  instagramAccountId?: string;
}

export class MediaQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 25;

  @ApiPropertyOptional({ description: 'Cursor from the previous response (nextCursor)' })
  @IsOptional() @IsString() @MaxLength(500) @Matches(/^[A-Za-z0-9_\-=+/]+$/)
  after?: string;
}

export class InsightsQueryDto {
  @ApiPropertyOptional({
    description: `Comma-separated. Allowed: ${INSIGHT_METRICS.join(', ')}`,
    example: 'reach,views,accounts_engaged',
  })
  @IsOptional() @IsString() @Matches(new RegExp(`^(${INSIGHT_METRICS.join('|')})(,(${INSIGHT_METRICS.join('|')}))*$`))
  metrics: string = 'reach,views,accounts_engaged';

  @ApiPropertyOptional({ minimum: 1, maximum: 30, default: 7, description: 'Look-back window in days' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30)
  days: number = 7;
}

export class InstagramAccountResponse {
  @ApiProperty() id: string;
  @ApiProperty() businessId: string;
  @ApiProperty({ example: 'instagram' }) platform: string;
  @ApiProperty() platformAccountId: string;
  @ApiProperty({ nullable: true }) username: string | null;
  @ApiProperty({ nullable: true }) displayName: string | null;
  @ApiProperty({ nullable: true, example: 'BUSINESS' }) accountType: string | null;
  @ApiProperty({ nullable: true }) followerCount: number | null;
  @ApiProperty({ nullable: true }) postCount: number | null;
  @ApiProperty({ enum: ['connected', 'expired', 'error', 'disconnected'] }) status: string;
  @ApiProperty() isMock: boolean;
  @ApiProperty({ nullable: true }) tokenExpiresAt: Date | null;
  @ApiProperty({ nullable: true }) lastSyncedAt: Date | null;
}

export class SyncRunResponse {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['profile', 'media', 'metrics'] }) kind: string;
  @ApiProperty({ enum: ['queued', 'running', 'succeeded', 'failed'] }) status: string;
  @ApiProperty() startedAt: Date;
  @ApiProperty({ nullable: true }) finishedAt: Date | null;
  @ApiProperty({ description: 'Posts upserted (each also gets one new metric snapshot)' }) itemsProcessed: number;
  @ApiProperty({ nullable: true, example: 'rate_limited' }) errorCode: string | null;
  @ApiProperty({ nullable: true }) errorMessage: string | null;
}
