import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedbackDto, GenerateRecommendationsDto, MockFeedbackDto, MockPreviewDto, OutcomeDto } from './ai-engine.dto';
import { AiEngineService } from './ai-engine.service';

/** Correlation id shared with the engine: a safe id from the caller is kept, otherwise a new one is made. */
export function correlationId(req: AuthenticatedRequest): string {
  const supplied = req.headers['x-request-id'];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  return value && /^[A-Za-z0-9._-]{8,64}$/.test(value) ? value : randomUUID();
}

const clamp = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
};

@ApiTags('AI insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-insights')
export class AiEngineController {
  constructor(private readonly insights: AiEngineService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether AI insights are turned on and reachable. Never fails.' })
  status(@Req() req: AuthenticatedRequest) {
    return this.insights.status(correlationId(req));
  }

  @Post('mock/overview')
  @ApiOperation({ summary: 'Load or generate a saved mock business analysis' })
  mockOverview(@Req() req: AuthenticatedRequest, @Body() dto: MockPreviewDto) {
    return this.insights.mockOverview(req.userId, correlationId(req), dto);
  }

  @Post('mock/recommendations/:id/feedback')
  @ApiOperation({ summary: 'Save feedback on a mock business recommendation' })
  mockFeedback(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: MockFeedbackDto) {
    return this.insights.mockFeedback(req.userId, correlationId(req), id, dto);
  }

  @Post('analysis')
  @ApiOperation({ summary: "Analyse the owner's Instagram performance" })
  analysis(@Req() req: AuthenticatedRequest) {
    return this.insights.analysis(req.userId, correlationId(req));
  }

  @Get('audience')
  @ApiOperation({ summary: 'Audience insights' })
  audience(@Req() req: AuthenticatedRequest) {
    return this.insights.audience(req.userId, correlationId(req));
  }

  @Get('competitors')
  @ApiOperation({ summary: 'Competitors tracked for this business' })
  competitors(@Req() req: AuthenticatedRequest) {
    return this.insights.competitors(req.userId, correlationId(req));
  }

  @Get('trends')
  @ApiOperation({ summary: 'Current trends relevant to this business, with their sources and freshness' })
  trends(@Req() req: AuthenticatedRequest) {
    return this.insights.trends(req.userId, correlationId(req));
  }

  @Post('recommendations/generate')
  @ApiOperation({ summary: 'Generate ranked, evidence-backed content ideas' })
  generate(@Req() req: AuthenticatedRequest, @Body() dto: GenerateRecommendationsDto) {
    return this.insights.generate(req.userId, correlationId(req), dto);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Previously generated recommendations' })
  list(@Req() req: AuthenticatedRequest, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.insights.listRecommendations(req.userId, correlationId(req), clamp(page, 1, 1, 10_000), clamp(pageSize, 20, 1, 100));
  }

  @Post('recommendations/:id/feedback')
  @ApiOperation({ summary: 'Record what the owner did with a recommendation' })
  feedback(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.insights.feedback(req.userId, correlationId(req), id, dto);
  }

  @Post('recommendations/:id/outcomes')
  @ApiOperation({ summary: 'Record measured results for a published recommendation' })
  outcome(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: OutcomeDto) {
    return this.insights.recordOutcome(req.userId, correlationId(req), id, dto);
  }

  @Get('learning')
  @ApiOperation({ summary: 'What the engine has learned from feedback and outcomes' })
  learning(@Req() req: AuthenticatedRequest) {
    return this.insights.learning(req.userId, correlationId(req));
  }
}
