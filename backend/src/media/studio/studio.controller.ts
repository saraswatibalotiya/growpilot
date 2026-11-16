import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AiEditMediaDto, AnalyzeMediaDto, EnhanceMediaDto } from './studio.dto';
import { StudioService } from './studio.service';

@ApiTags('Photo Studio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  @Post('analyze')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Check photo quality (free) and, optionally, have Claude describe it. Never edits the photo.' })
  analyze(@Req() req: AuthenticatedRequest, @Body() dto: AnalyzeMediaDto) {
    return this.studio.analyze(req.userId, dto);
  }

  @Post('enhance')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Quick Enhance or Professional Background at Instagram size. Built-in processing, no AI cost.' })
  enhance(@Req() req: AuthenticatedRequest, @Body() dto: EnhanceMediaDto) {
    return this.studio.enhance(req.userId, dto);
  }

  @Post('ai-edit')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Optional Gemini edit: new background scene or lighting fix, product preserved. Cached per photo + style + model. 503 when not configured, 429 over the daily limit.' })
  aiEdit(@Req() req: AuthenticatedRequest, @Body() dto: AiEditMediaDto) {
    return this.studio.aiEdit(req.userId, dto);
  }

  @Get('ai-usage')
  @ApiOperation({ summary: "Whether AI image editing is available, the styles, and today's Gemini usage and limit" })
  aiUsage(@Req() req: AuthenticatedRequest) {
    return this.studio.aiUsage(req.userId);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'The original, its processed versions and the stored analysis' })
  preview(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.preview(req.userId, id);
  }

  @Post(':id/approve')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'The owner approves this photo (original or processed) for use in posts' })
  approve(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.studio.approve(req.userId, id);
  }
}
