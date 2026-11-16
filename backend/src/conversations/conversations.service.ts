import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { ConversationsRepository, type MessageWrite } from './conversations.repository';
import type { CreateMessageDto } from './conversations.dto';

const MESSAGE_LIMIT = 100;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly business: BusinessService,
    private readonly repository: ConversationsRepository,
  ) {}

  async create(userId: string) {
    const businessId = await this.business.primaryBusinessId(userId);
    return this.repository.create(randomUUID(), businessId, userId);
  }

  async get(userId: string, id: string) {
    const conversation = await this.owned(userId, id);
    const messages = await this.repository.listMessages(id, MESSAGE_LIMIT);
    return { ...conversation, messages };
  }

  /** Owner's voice transcript or typed text. Assistant replies use addAssistantMessage, never this endpoint. */
  async addUserMessage(userId: string, id: string, dto: CreateMessageDto) {
    const conversation = await this.owned(userId, id);
    if (conversation.status !== 'active') throw new ConflictException('This conversation is closed');
    return this.repository.appendMessage(randomUUID(), id, {
      role: 'user',
      content: dto.content,
      language: dto.language ?? null,
      metadata: dto.metadata ?? null,
    });
  }

  /** Internal only: stores an assistant reply (used by the AI step). Not exposed as a route. */
  async addAssistantMessage(conversationId: string, data: Omit<MessageWrite, 'role'>) {
    return this.repository.appendMessage(randomUUID(), conversationId, { ...data, role: 'assistant' });
  }

  /** Loads a conversation only if it belongs to the caller's business; otherwise it looks missing. */
  private async owned(userId: string, id: string) {
    const businessId = await this.business.primaryBusinessId(userId);
    const conversation = await this.repository.findById(id);
    if (!conversation || conversation.businessId !== businessId) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}
