import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { ClassifyIntentDto, EditContentDto, GenerateContentDto } from './dto/ai.dto';

/** Thin HTTP layer. All model calls happen in services, never here. Nothing in this controller publishes. */
@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiOrchestratorService) {}

  @Post('classify-intent')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'What does the owner want, and which product, price, offer, tone and language did they mention? (Claude Haiku)' })
  @ApiNotFoundResponse({ description: 'Conversation not found or not yours' })
  classify(@Req() req: AuthenticatedRequest, @Body() dto: ClassifyIntentDto) {
    return this.ai.classifyIntent(req.userId, dto);
  }

  @Post('generate-content')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Write the headline, caption, CTA, hashtags and poster specification (Claude Sonnet)',
    description:
      'Uses only facts from the shop records and the owner\'s words; missing facts are left out, never invented. If `postId` is given, the content is saved into that draft and the post moves to PREVIEW_READY. Nothing is published.',
  })
  @ApiBadRequestResponse({ description: 'Invalid input, or an image that was not uploaded through GrowPilot' })
  @ApiNotFoundResponse({ description: 'Conversation, product or post not found or not yours' })
  @ApiConflictResponse({ description: 'The post can no longer be changed' })
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  generate(@Req() req: AuthenticatedRequest, @Body() dto: GenerateContentDto) {
    return this.ai.generateContent(req.userId, dto);
  }

  @Post('edit-content')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Change an existing draft from a spoken or typed instruction (Claude Haiku plans, Claude Sonnet edits)',
    description: 'Only the requested parts change; confirmed prices and earlier edits are kept. Returns the complete updated draft.',
  })
  @ApiNotFoundResponse({ description: 'Conversation or post not found or not yours' })
  @ApiConflictResponse({ description: 'The post is approved or published, or has no draft yet' })
  edit(@Req() req: AuthenticatedRequest, @Body() dto: EditContentDto) {
    return this.ai.editContent(req.userId, dto);
  }
}
