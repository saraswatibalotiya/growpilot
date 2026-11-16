import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaginationQueryDto } from '../common/pagination';
import { CreateReelDto, PublishReelDto, RegenerateReelDto, UpdateReelDto } from './reels.dto';
import { ReelsService } from './reels.service';

@ApiTags('Reels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reels')
export class ReelsController {
  constructor(private readonly reels: ReelsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Make a 10, 15 or 30-second Reel from a product photo', description: 'Returns at once with status QUEUED. Poll GET /reels/:id/status; the job runs in the background (script, voiceover, video).' })
  @ApiBadRequestResponse({ description: 'No photo, no product name, unreadable price, or a Special Offer without an offer or price' })
  @ApiNotFoundResponse({ description: 'Product or photo not found, or not yours' })
  generate(@Req() req: AuthenticatedRequest, @Body() dto: CreateReelDto) {
    return this.reels.generate(req.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the owner's reels, newest first" })
  list(@Req() req: AuthenticatedRequest, @Query() query: PaginationQueryDto) {
    return this.reels.list(req.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One reel with script, scenes, caption, hashtags, URLs and what is out of date (`stale`)' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  get(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reels.get(req.userId, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Cheap progress check for polling: status, stage, error and URLs' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  status(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reels.status(req.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a reel (READY, APPROVED or FAILED only)', description: 'Reports what became out of date in `stale`. Caption and hashtag edits never need a re-render; script, template, language and on-screen text edits do (POST /reels/:id/regenerate). Editing an APPROVED reel moves it back to READY.' })
  @ApiConflictResponse({ description: 'The reel is being made, published, or already published' })
  update(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReelDto) {
    return this.reels.update(req.userId, id, dto);
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Re-make part of a reel', description: 'script: new script, then voice and video. voice: new voice, then video. video: render only. all: same as script.' })
  @ApiConflictResponse({ description: 'The reel is being made, published, or already published' })
  regenerate(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegenerateReelDto) {
    return this.reels.regenerate(req.userId, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a reel that is being made (checked between steps)' })
  @ApiConflictResponse({ description: 'The reel is not being made' })
  cancel(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reels.cancel(req.userId, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a READY reel (the owner\'s explicit action). Required before publishing.' })
  @ApiConflictResponse({ description: 'Not READY, or the video is out of date' })
  approve(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reels.approve(req.userId, id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Approve and publish: post this approved reel to the connected Instagram account',
    description: 'Needs ENABLE_LIVE_INSTAGRAM_PUBLISH=true, an approved reel, a real allowlisted Instagram connection and `confirm: true`. A failure at or after the final publish call is not retried automatically.',
  })
  @ApiForbiddenResponse({ description: 'Publishing is off, the account is not allowlisted, or Instagram lacks the permission' })
  @ApiConflictResponse({ description: 'Not approved, already publishing or published, video out of date, or a previous attempt may be live' })
  @ApiNotFoundResponse({ description: 'Reel not found or not yours' })
  publish(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() _dto: PublishReelDto) {
    return this.reels.publish(req.userId, id);
  }
}
