import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PublishPostDto } from './publishing.dto';
import { PublishingService } from './publishing.service';

@ApiTags('Publishing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Post(':id/publish')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Approve and publish: post this approved draft to the connected Instagram account',
    description:
      'Needs ENABLE_LIVE_INSTAGRAM_PUBLISH=true, an approved post, a real allowlisted Instagram connection and `confirm: true`. One photo posts normally; 2 to 10 become a carousel. A photo that was already published is refused.',
  })
  @ApiForbiddenResponse({ description: 'Publishing is off, the account is not allowlisted, or Instagram lacks the permission' })
  @ApiConflictResponse({ description: 'Not approved, duplicate photo, already publishing, or the connection expired' })
  @ApiNotFoundResponse({ description: 'Post not found or not yours' })
  publish(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishPostDto) {
    return this.publishing.publish(req.userId, id, dto.format ?? 'post');
  }
}
