import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EditPosterDto, GeneratePosterDto, RenderPosterDto, SavePosterDto } from './poster.dto';
import { PosterService } from './poster.service';

/** Poster design and drawing. Nothing here publishes: a poster is only attached to a draft post. */
@ApiTags('Posters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posters')
export class PosterController {
  constructor(private readonly posters: PosterService) {}

  @Get('options')
  @ApiOperation({ summary: 'Templates and design choices the poster editor offers' })
  options() {
    return this.posters.options();
  }

  @Post('generate')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Design and draw a poster from a product photo (Claude Sonnet designs, Sharp draws)',
    description:
      'Claude looks at the photo and proposes a layout and colours. The poster is then drawn from the owner\'s real photo, which is never changed. The price comes only from the product record or `price`; the AI never supplies one.',
  })
  generate(@Req() req: AuthenticatedRequest, @Body() dto: GeneratePosterDto) {
    return this.posters.generate(req.userId, dto);
  }

  @Post('render')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Draw a poster from a design the owner changed with the selectors. No AI call.' })
  render(@Req() req: AuthenticatedRequest, @Body() dto: RenderPosterDto) {
    return this.posters.render(req.userId, dto);
  }

  @Post('edit')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Change the poster from a short instruction such as "make it look premium" (Claude Haiku), then redraw it' })
  edit(@Req() req: AuthenticatedRequest, @Body() dto: EditPosterDto) {
    return this.posters.edit(req.userId, dto);
  }

  @Post(':id/save')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Attach a finished poster to a draft post (not possible after approval)' })
  save(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SavePosterDto) {
    return this.posters.save(req.userId, id, dto);
  }
}
