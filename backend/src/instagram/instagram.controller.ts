import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Redirect, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CallbackQueryDto,
  ConnectQueryDto,
  ConnectWithTokenDto,
  INSIGHT_METRICS,
  InsightsQueryDto,
  InstagramAccountResponse,
  ListAccountsQueryDto,
  MediaQueryDto,
  SyncRunResponse,
} from './instagram.dto';
import { InstagramSyncService } from './instagram-sync.service';
import { InstagramService } from './instagram.service';

@ApiTags('Instagram')
@Controller('integrations/instagram')
export class InstagramController {
  constructor(
    private readonly instagram: InstagramService,
    private readonly syncs: InstagramSyncService,
  ) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start Instagram Login OAuth; returns the URL to send the user to (read-only scopes)' })
  @ApiOkResponse({ schema: { properties: { authorizationUrl: { type: 'string' }, mode: { enum: ['mock', 'live'] } } } })
  @ApiNotFoundResponse({ description: 'Business not found or not owned by caller' })
  @ApiUnauthorizedResponse()
  connect(@Req() req: AuthenticatedRequest, @Query() query: ConnectQueryDto) {
    return this.instagram.createAuthorizationUrl(req.userId, query.businessId);
  }

  @Post('connect/token')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Test mode: connect using a token generated in the Meta dashboard',
    description: 'Requires ENABLE_TEST_MODE=true. The token is verified with Instagram, allowlist-checked, then stored encrypted.',
  })
  @ApiOkResponse({ type: [InstagramAccountResponse] })
  @ApiForbiddenResponse({ description: 'Test mode off, not allowlisted, or not a Business/Creator account' })
  @ApiConflictResponse({ description: 'Account already connected elsewhere' })
  connectWithToken(@Req() req: AuthenticatedRequest, @Body() dto: ConnectWithTokenDto) {
    return this.instagram.connectWithToken(req.userId, dto.businessId, dto.accessToken, dto.instagramAccountId);
  }

  @Get('callback')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Redirect()
  @ApiOperation({ summary: 'OAuth redirect target (called by Instagram). Stores the connection, then redirects to the frontend' })
  @ApiResponse({ status: 302, description: 'Redirects to FRONTEND_URL/connect/instagram?status=success|error&code=...' })
  async callback(@Query() query: CallbackQueryDto) {
    return { url: await this.instagram.handleCallback(query), statusCode: 302 };
  }

  @Get('result')
  @ApiOperation({ summary: 'Shows the OAuth outcome when FRONTEND_URL is not configured' })
  result(@Query('status') status?: string, @Query('code') code?: string) {
    return this.instagram.describeResult(status, code);
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Instagram accounts connected to a business' })
  @ApiOkResponse({ type: [InstagramAccountResponse] })
  listAccounts(@Req() req: AuthenticatedRequest, @Query() query: ListAccountsQueryDto) {
    return this.instagram.listAccounts(req.userId, query.businessId);
  }

  @Get('accounts/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stored identity, follower count and post count (never returns tokens)' })
  @ApiOkResponse({ type: InstagramAccountResponse })
  @ApiNotFoundResponse()
  getAccount(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.instagram.getAccount(req.userId, id);
  }

  @Post('accounts/:id/sync')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-fetch profile (username, followers, media count) from Instagram and store it' })
  @ApiOkResponse({ type: InstagramAccountResponse })
  @ApiConflictResponse({ description: 'Connection expired/disconnected: reconnect' })
  @ApiForbiddenResponse({ description: 'Missing permission' })
  sync(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.instagram.syncProfile(req.userId, id);
  }

  @Post('accounts/:id/sync-media')
  @HttpCode(202)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Queue a media sync (live mode only)',
    description:
      'Pages through the account media list, upserts posts on (account, media id) and appends one metric snapshot per post. ' +
      'Returns immediately with the sync run; poll GET .../sync-runs. If a sync is already in progress, that run is returned.',
  })
  @ApiResponse({ status: 202, description: 'Run queued (or already in progress)', type: SyncRunResponse })
  @ApiConflictResponse({ description: 'Not live mode, mock account, or connection expired/disconnected' })
  @ApiNotFoundResponse({ description: 'Account not found or not owned by caller' })
  async syncMedia(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const { run, alreadyInProgress } = await this.syncs.requestMediaSync(req.userId, id);
    return { alreadyInProgress, run };
  }

  @Get('accounts/:id/sync-runs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Last 20 sync runs for the account, newest first' })
  @ApiOkResponse({ type: [SyncRunResponse] })
  syncRuns(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.syncs.listRuns(req.userId, id);
  }

  @Get('accounts/:id/media')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Live media list with like/comment counts (cursor paginated, not stored)' })
  media(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Query() query: MediaQueryDto) {
    return this.instagram.getMedia(req.userId, id, { limit: query.limit, after: query.after });
  }

  @Get('accounts/:id/insights')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Account insights totals for a look-back window',
    description: `Metrics: ${INSIGHT_METRICS.join(', ')}. Availability varies by account; unavailable metrics return 403.`,
  })
  insights(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Query() query: InsightsQueryDto) {
    return this.instagram.getInsights(req.userId, id, { metrics: query.metrics.split(','), days: query.days });
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect: wipes the stored token and marks the account disconnected' })
  disconnect(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.instagram.disconnect(req.userId, id);
  }
}
