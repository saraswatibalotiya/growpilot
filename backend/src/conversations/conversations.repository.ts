import { Injectable } from '@nestjs/common';
import type { Language, MessageRole } from '../common/constants';
import { PrismaService } from '../database/prisma.service';

const CONVERSATION_FIELDS = ['id', 'businessId', 'userId', 'status', 'createdAt', 'updatedAt'] as const;
const MESSAGE_FIELDS = ['id', 'conversationId', 'role', 'content', 'language', 'metadata', 'createdAt'] as const;

export interface MessageWrite {
  role: MessageRole;
  content: string;
  language?: Language | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get conversations() {
    return this.prisma.db.orm.public.Conversation;
  }

  private get messages() {
    return this.prisma.db.orm.public.ConversationMessage;
  }

  create(id: string, businessId: string, userId: string) {
    return this.conversations.select(...CONVERSATION_FIELDS).create({ id, businessId, userId, status: 'active' });
  }

  findById(id: string) {
    return this.conversations.select(...CONVERSATION_FIELDS).where({ id }).first();
  }

  /** Oldest first, so the conversation reads top to bottom. */
  listMessages(conversationId: string, limit: number) {
    return this.messages
      .select(...MESSAGE_FIELDS)
      .where({ conversationId })
      .orderBy((m) => m.createdAt.asc())
      .limit(limit)
      .all();
  }

  /** Inserts the message and touches the conversation in one transaction, so both succeed or neither does. */
  appendMessage(id: string, conversationId: string, data: MessageWrite) {
    return this.prisma.db.transaction(async (tx) => {
      const message = await tx.orm.public.ConversationMessage.select(...MESSAGE_FIELDS).create({
        id,
        conversationId,
        role: data.role,
        content: data.content,
        language: data.language ?? null,
        // Prisma's Json input type is narrower than a plain object; the DTO has already validated it.
        metadata: (data.metadata ?? null) as never,
      });
      await tx.orm.public.Conversation.where({ id: conversationId }).update({ updatedAt: new Date() });
      return message;
    });
  }
}
