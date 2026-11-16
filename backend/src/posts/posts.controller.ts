import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePostDto, ListPostsQueryDto, UpdatePostDto } from './posts.dto';
import { PostsService } from './posts.service';

@ApiTags('Posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft post for the owner\'s business (status DRAFT)' })
  @ApiBadRequestResponse({ description: 'Invalid field, or a product/conversation that is not yours' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePostDto) {
    return this.posts.create(req.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the owner\'s posts, newest first; filter by status' })
  list(@Req() req: AuthenticatedRequest, @Query() query: ListPostsQueryDto) {
    return this.posts.list(req.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One post (owner only)' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  get(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.get(req.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a post, or approve a preview with status USER_APPROVED' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  @ApiConflictResponse({ description: 'Edit after approval, or approve a post that is not a preview' })
  update(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto) {
    return this.posts.update(req.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a pending draft (DRAFT, CONTENT_GENERATED or PREVIEW_READY) and its photo links' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  @ApiConflictResponse({ description: 'The post is approved, being published, published or failed' })
  async remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.posts.remove(req.userId, id);
  }
}
