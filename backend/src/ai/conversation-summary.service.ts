import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { BusinessContext } from './business-context.service';
import { ClaudeProviderService } from './claude-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ConversationsRepository } from '../conversations/conversations.repository';
import { ConversationSummarySchema } from './schemas';
import { BusinessContextService } from './business-context.service';

/**
 * Keeps a compact summary of each conversation (written by Haiku) so later requests send a few lines instead of
 * the whole history. It is stored as a system message in the existing conversation, so no schema change is
 * needed. It is a convenience only: verified records and newer owner instructions always override it.
 */
@Injectable()
export class ConversationSummaryService {
  private readonly logger = new Logger(ConversationSummaryService.name);

  constructor(
    private readonly provider: ClaudeProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly conversations: ConversationsRepository,
    private readonly context: BusinessContextService,
  ) {}

  /** Best effort: a failed summary must never fail the request the owner is waiting on. */
  async refresh(ctx: BusinessContext, draftStatus: string | null): Promise<void> {
    try {
      const prompt = this.prompts.summary({
        previousSummary: ctx.conversation.summary ? JSON.stringify(ctx.conversation.summary) : null,
        messages: ctx.conversation.recentMessages,
        draftStatus,
        verifiedFacts: this.context.factsJson(ctx),
      });
      const summary = await this.provider.parse({ task: 'summary', system: prompt.system, user: prompt.user, schema: ConversationSummarySchema });
      await this.conversations.appendMessage(randomUUID(), ctx.conversation.id, {
        role: 'system',
        content: `${summary.currentIntent} (${summary.draftStatus})`.slice(0, 500),
        language: null,
        metadata: { kind: 'summary', promptVersion: this.prompts.version, summary } as never,
      });
    } catch (error) {
      this.logger.warn({ event: 'conversation_summary_failed', conversationId: ctx.conversation.id, reason: (error as Error).constructor.name });
    }
  }
}
