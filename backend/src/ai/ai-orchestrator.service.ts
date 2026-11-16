import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DEFAULT_CAPTION_LENGTH, DEFAULT_HASHTAG_LEVEL } from '../common/constants';
import { ConversationsService } from '../conversations/conversations.service';
import { PostsService } from '../posts/posts.service';
import { EDITABLE_STATUSES, type PostStatus } from '../posts/posts.state';
import { BusinessContextService } from './business-context.service';
import { ContentEditingService, type Draft } from './content-editing.service';
import { ContentGenerationService } from './content-generation.service';
import { GenerationCacheRepository } from './generation-cache.repository';
import { ConversationSummaryService } from './conversation-summary.service';
import type { ClassifyIntentDto, EditContentDto, GenerateContentDto } from './dto/ai.dto';
import { ImageAnalysisService } from './image-analysis.service';
import { IntentClassificationService } from './intent-classification.service';
import { PromptBuilderService } from './prompt-builder.service';
import type { EditedContent, GeneratedContent, ImageAnalysis, IntentResult, Language } from './schemas';

export type ClarificationResponse = {
  requiresClarification: true;
  clarificationQuestion: string;
  language: Language;
  postId: string | null;
  postStatus: string | null;
  warnings: string[];
};

export type GenerateContentResponse =
  | ClarificationResponse
  | (GeneratedContent & {
      requiresClarification: false;
      imageAnalysis: ImageAnalysis | null;
      postId: string | null;
      postStatus: string | null;
      warnings: string[];
      promptVersion: string;
      /** True when an earlier answer for the same photos and words was reused, so no AI request was made. */
      reused: boolean;
    });

export type EditContentResponse =
  | ClarificationResponse
  | (Omit<EditedContent, 'requiresClarification' | 'clarificationQuestion'> & {
      requiresClarification: false;
      clarificationQuestion: null;
      postId: string;
      postStatus: string;
      warnings: string[];
      promptVersion: string;
    });

/**
 * Coordinates one request from start to finish: build trusted context, pick the right service (and so the right
 * model), validate, optionally save into the owner's draft, and record the exchange in the conversation.
 *
 * It generates content only. It never publishes: publishing needs the owner's separate approval and the existing
 * publishing workflow, and nothing in this class can call it.
 */
@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly context: BusinessContextService,
    private readonly intent: IntentClassificationService,
    private readonly generation: ContentGenerationService,
    private readonly editing: ContentEditingService,
    private readonly images: ImageAnalysisService,
    private readonly summaries: ConversationSummaryService,
    private readonly posts: PostsService,
    private readonly conversations: ConversationsService,
    private readonly prompts: PromptBuilderService,
    private readonly cache: GenerationCacheRepository,
  ) {}

  async classifyIntent(userId: string, dto: ClassifyIntentDto): Promise<IntentResult> {
    const ctx = await this.context.build(userId, { conversationId: dto.conversationId });
    return this.intent.classify(ctx, dto.transcript, 'intent');
  }

  async generateContent(userId: string, dto: GenerateContentDto): Promise<GenerateContentResponse> {
    const ctx = await this.context.build(userId, { conversationId: dto.conversationId, productId: dto.productId });
    const post = dto.postId ? await this.ownedEditablePost(userId, dto.postId, dto.conversationId) : null;

    // 1. A photo that was already published is refused before any AI request: duplicates cost nothing.
    const photoUrls = post ? (await this.posts.imageUrlsOf(post.id)).map((i) => i.imageUrl) : dto.imageUrl ? [dto.imageUrl] : [];
    await this.posts.assertNotPublishedDuplicate(ctx.businessId, photoUrls);

    const captionLength = dto.captionLength ?? DEFAULT_CAPTION_LENGTH;
    const hashtagLevel = dto.hashtagLevel ?? DEFAULT_HASHTAG_LEVEL;

    // 2. Same photos + same words + same language: reuse the saved answer instead of calling the model again.
    const photoHashes = await this.posts.photoHashes(photoUrls);
    const cacheKey = photoHashes.length ? GenerationCacheRepository.keyFor({ photoHashes, transcript: dto.transcript, language: dto.language, productId: dto.productId, tone: dto.tone, captionLength, hashtagLevel }) : null;
    const saved = cacheKey ? ((await this.cache.find(ctx.businessId, cacheKey)) as { content: GeneratedContent; imageAnalysis: ImageAnalysis | null } | null) : null;
    if (saved && post) return this.reuse(userId, ctx.conversation.id, post, saved);

    // Haiku reads the owner's words; Sonnet looks at the photo. They don't depend on each other.
    const [intent, image] = await Promise.all([
      this.intent.classify(ctx, dto.transcript, 'extraction'),
      dto.imageUrl ? this.images.analyse(ctx.businessId, dto.imageUrl) : Promise.resolve({ analysis: null, warning: null }),
    ]);
    const warnings = image.warning ? [image.warning] : [];
    const language: Language = dto.language ?? ctx.business.preferredLanguage ?? intent.language ?? 'en';
    // The photo tells us what the product is; the owner should never have to say it.
    if (!intent.entities.productName && image.analysis?.productType) intent.entities.productName = image.analysis.productType;

    if (intent.requiresClarification && intent.clarificationQuestion) {
      return this.clarify(ctx.conversation.id, intent.clarificationQuestion, language, post?.id ?? null, post?.status ?? null, warnings);
    }

    const content = await this.generation.generate({ ctx, transcript: dto.transcript, language, tone: dto.tone, captionLength, hashtagLevel, entities: intent.entities, imageAnalysis: image.analysis });
    if (content.requiresClarification && content.clarificationQuestion) {
      return this.clarify(ctx.conversation.id, content.clarificationQuestion, language, post?.id ?? null, post?.status ?? null, warnings);
    }

    if (cacheKey) await this.cache.save(ctx.businessId, cacheKey, { content, imageAnalysis: image.analysis });

    let postStatus: string | null = post?.status ?? null;
    if (post) {
      postStatus = await this.saveDraft(userId, post.id, post.status, {
        headline: content.headline,
        caption: content.caption,
        callToAction: content.callToAction,
        hashtags: content.hashtags,
        language: content.language,
      });
    }

    await this.conversations.addAssistantMessage(ctx.conversation.id, {
      content: `${content.headline}\n${content.caption}`.slice(0, 2000),
      language: content.language,
      metadata: { kind: 'generated_content', postId: post?.id ?? null, promptVersion: this.prompts.version } as never,
    });
    await this.summaries.refresh(ctx, postStatus);

    return {
      ...content,
      requiresClarification: false,
      imageAnalysis: image.analysis,
      postId: post?.id ?? null,
      postStatus,
      warnings,
      promptVersion: this.prompts.version,
      reused: false,
    };
  }

  /** Puts an earlier answer into this draft. No model is called, not even for the summary. */
  private async reuse(
    userId: string,
    conversationId: string,
    post: { id: string; status: string },
    saved: { content: GeneratedContent; imageAnalysis: ImageAnalysis | null },
  ): Promise<GenerateContentResponse> {
    const { content } = saved;
    const postStatus = await this.saveDraft(userId, post.id, post.status as PostStatus, {
      headline: content.headline,
      caption: content.caption,
      callToAction: content.callToAction,
      hashtags: content.hashtags,
      language: content.language,
    });
    await this.conversations.addAssistantMessage(conversationId, {
      content: `${content.headline}\n${content.caption}`.slice(0, 2000),
      language: content.language,
      metadata: { kind: 'generated_content', postId: post.id, promptVersion: this.prompts.version, reused: true } as never,
    });
    return { ...content, requiresClarification: false, imageAnalysis: saved.imageAnalysis, postId: post.id, postStatus, warnings: [], promptVersion: this.prompts.version, reused: true };
  }

  async editContent(userId: string, dto: EditContentDto): Promise<EditContentResponse> {
    const ctx = await this.context.build(userId, { conversationId: dto.conversationId });
    const post = await this.ownedEditablePost(userId, dto.postId, dto.conversationId);
    const draft: Draft = {
      headline: (post['headline'] as string | null) ?? null,
      caption: (post['caption'] as string | null) ?? null,
      callToAction: (post['callToAction'] as string | null) ?? null,
      hashtags: (post['hashtags'] as string[] | null) ?? null,
      language: (post['language'] as Language | null) ?? null,
    };
    if (!draft.caption && !draft.headline) throw new ConflictException('There is no draft to edit yet. Generate content first.');

    // The instruction is the owner's message, so it is recorded in the conversation.
    await this.conversations.addUserMessage(userId, dto.conversationId, { content: dto.instruction, metadata: { source: 'edit' } } as never);

    const plan = await this.editing.plan(draft, dto.instruction);
    const language = this.editing.outputLanguage(draft, plan, ctx);
    if (plan.requiresClarification && plan.clarificationQuestion) {
      return this.clarify(ctx.conversation.id, plan.clarificationQuestion, language, post.id, post.status, []);
    }

    const edited = await this.editing.edit({ ctx, draft, instruction: dto.instruction, plan });
    if (edited.requiresClarification && edited.clarificationQuestion) {
      return this.clarify(ctx.conversation.id, edited.clarificationQuestion, language, post.id, post.status, []);
    }

    const postStatus = await this.saveDraft(userId, post.id, post.status, {
      headline: edited.headline,
      caption: edited.caption,
      callToAction: edited.callToAction,
      hashtags: edited.hashtags,
      language: edited.language,
    });

    await this.conversations.addAssistantMessage(ctx.conversation.id, {
      content: edited.changesApplied.join('. ').slice(0, 2000) || 'Updated the draft.',
      language: edited.language,
      metadata: { kind: 'edited_content', postId: post.id, promptVersion: this.prompts.version } as never,
    });
    await this.summaries.refresh(ctx, postStatus);

    const { price: _price, ...result } = edited;
    return { ...result, requiresClarification: false, clarificationQuestion: null, postId: post.id, postStatus, warnings: [], promptVersion: this.prompts.version };
  }

  /** The post must be the owner's, linked to this conversation if it is linked at all, and still editable. */
  private async ownedEditablePost(userId: string, postId: string, conversationId: string) {
    const post = await this.posts.get(userId, postId);
    if (post['conversationId'] && post['conversationId'] !== conversationId) {
      throw new BadRequestException('This post belongs to a different conversation');
    }
    if (!EDITABLE_STATUSES.includes(post.status as PostStatus)) {
      throw new ConflictException(`A post in ${post.status} can't be changed by the AI`);
    }
    return post;
  }

  /**
   * Saves the content into the draft. A DRAFT moves to CONTENT_GENERATED and then PREVIEW_READY, the server-side
   * steps that let the owner review and, separately, approve it. Approval and publishing are never triggered here.
   */
  private async saveDraft(
    userId: string,
    postId: string,
    status: PostStatus,
    content: { headline: string; caption: string; callToAction: string; hashtags: string[]; language: Language },
  ): Promise<string> {
    let current: string = (await this.posts.update(userId, postId, content as never))['status'] as string;
    if (status === 'DRAFT' || current === 'DRAFT') {
      current = String((await this.posts.moveTo(postId, 'CONTENT_GENERATED'))['status']);
    }
    if (current === 'CONTENT_GENERATED') {
      current = String((await this.posts.moveTo(postId, 'PREVIEW_READY'))['status']);
    }
    return current;
  }

  private async clarify(conversationId: string, question: string, language: Language, postId: string | null, postStatus: string | null, warnings: string[]): Promise<ClarificationResponse> {
    await this.conversations.addAssistantMessage(conversationId, { content: question, language, metadata: { kind: 'clarification' } as never });
    return { requiresClarification: true, clarificationQuestion: question, language, postId, postStatus, warnings };
  }
}
