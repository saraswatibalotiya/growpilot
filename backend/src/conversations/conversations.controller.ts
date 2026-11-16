import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMessageDto } from './conversations.dto';
import { ConversationsService } from './conversations.service';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @ApiOperation({ summary: "Start a conversation for the owner's business" })
  create(@Req() req: AuthenticatedRequest) {
    return this.conversations.create(req.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A conversation and its messages, oldest first (owner only)' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  get(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.get(req.userId, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add the owner\'s message (voice transcript or text) to a conversation' })
  @ApiNotFoundResponse({ description: 'Not found, or not owned by the caller' })
  @ApiConflictResponse({ description: 'The conversation is closed' })
  addMessage(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMessageDto) {
    return this.conversations.addUserMessage(req.userId, id, dto);
  }
}
