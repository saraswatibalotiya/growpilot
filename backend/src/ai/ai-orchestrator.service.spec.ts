import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { BusinessContextService } from './business-context.service';
import type { ClaudeProviderService } from './claude-provider.service';
import { ContentEditingService } from './content-editing.service';
import { ContentGenerationService } from './content-generation.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { ImageAnalysisService } from './image-analysis.service';
import { IntentClassificationService } from './intent-classification.service';
import { PromptBuilderService } from './prompt-builder.service';
import { context, contentReply, editedReply, entities, FakeProvider, intentReply, planReply } from './test-helpers';

const summaryReply = { businessAndProduct: 'Cotton kurtis', currentIntent: 'CREATE', draftStatus: 'PREVIEW_READY', confirmedFacts: [], ownerPreferences: [], pendingQuestions: [] };

/** A stand-in that throws on any method not listed, so an unexpected call (such as publish) fails the test. */
function strict<T extends Record<string, unknown>>(name: string, target: T): T {
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!(prop in obj)) throw new Error(`${name}.${String(prop)} must not be called`);
      return obj[prop as string];
    },
  });
}

class StubContext extends BusinessContextService {
  built = jest.fn();
  constructor() {
    super(null as never, null as never, null as never, null as never);
  }
  override build = this.built as never;
}

function build(opts: { post?: Record<string, unknown> | null; ctx?: ReturnType<typeof context> } = {}) {
  const provider = new FakeProvider();
  const prompts = new PromptBuilderService();
  const asProvider = provider as unknown as ClaudeProviderService;
  const ctxService = new StubContext();
  ctxService.built.mockResolvedValue(opts.ctx ?? context());

  const post = opts.post === undefined ? { id: 'post-1', status: 'DRAFT', conversationId: 'conv-1', headline: null, caption: null, callToAction: null, hashtags: null, language: null } : opts.post;
  const state = { status: String(post?.['status'] ?? 'DRAFT') };
  const posts = strict('posts', {
    get: jest.fn(async () => {
      if (!post) throw new NotFoundException('Post not found');
      return { ...post, status: state.status };
    }),
    update: jest.fn(async () => ({ id: 'post-1', status: state.status })),
    imageUrlsOf: jest.fn(async () => [{ position: 0, imageUrl: 'https://res.cloudinary.com/x/a.jpg' }]),
    photoHashes: jest.fn(async () => ['hash-a']),
    assertNotPublishedDuplicate: jest.fn(async () => undefined),
    moveTo: jest.fn(async (_id: string, to: string) => {
      state.status = to;
      return { id: 'post-1', status: to };
    }),
  });
  const conversations = strict('conversations', { addAssistantMessage: jest.fn(), addUserMessage: jest.fn() });
  const conversationsRepo = { appendMessage: jest.fn() };
  const media = { findBySecureUrl: jest.fn() };

  const store = new Map<string, unknown>();
  const cache = { find: jest.fn(async (_b: string, key: string) => store.get(key) ?? null), save: jest.fn(async (_b: string, key: string, value: unknown) => void store.set(key, value)) };

  const orchestrator = new AiOrchestratorService(
    ctxService,
    new IntentClassificationService(asProvider, prompts),
    new ContentGenerationService(asProvider, prompts, ctxService),
    new ContentEditingService(asProvider, prompts, ctxService),
    new ImageAnalysisService({ get: () => undefined } as never, asProvider, prompts, media as never),
    new ConversationSummaryService(asProvider, prompts, conversationsRepo as never, ctxService),
    posts as never,
    conversations as never,
    prompts,
    cache as never,
  );
  return { orchestrator, provider, posts, conversations, conversationsRepo, ctxService, state, cache };
}

const generateDto = { conversationId: 'conv-1', postId: 'post-1', tone: 'friendly' as const, hashtagLevel: 'few' as const, transcript: 'New cotton kurtis aaye hain. Ek attractive post banao.' };

describe('AiOrchestratorService', () => {
  it('classifies intent with Haiku only', async () => {
    const { orchestrator, provider } = build();
    provider.queue('intent', intentReply());
    expect(await orchestrator.classifyIntent('u1', { conversationId: 'conv-1', transcript: 'post banao' })).toMatchObject({ intent: 'CREATE' });
    expect(provider.calls.map((c) => c.task)).toEqual(['intent']);
  });

  it('does not reuse a saved answer written in a different tone', async () => {
    const { orchestrator, provider, cache } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    await orchestrator.generateContent('u1', generateDto);
    const key = (cache.save.mock.calls[0] as unknown[])[1];
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    await orchestrator.generateContent('u1', { ...generateDto, tone: 'funny' });
    expect((cache.save.mock.calls[1] as unknown[])[1]).not.toBe(key);
  });

  it('generates content, saves it into the draft, and moves it to PREVIEW_READY without approving or publishing', async () => {
    const { orchestrator, provider, posts, conversations } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    const result = await orchestrator.generateContent('u1', generateDto);

    expect(result).toMatchObject({ requiresClarification: false, language: 'hi', postId: 'post-1', postStatus: 'PREVIEW_READY' });
    expect(posts.update).toHaveBeenCalledWith('u1', 'post-1', expect.objectContaining({ headline: expect.any(String), language: 'hi' }));
    expect(posts.moveTo.mock.calls.map((c) => c[1])).toEqual(['CONTENT_GENERATED', 'PREVIEW_READY']);
    expect(conversations.addAssistantMessage).toHaveBeenCalledTimes(1);
    // Haiku read the owner's words, Sonnet wrote the content, Haiku summarised.
    expect(provider.calls.map((c) => c.task).sort()).toEqual(['content', 'intent', 'summary']);
  });

  it('refuses a photo that was already published, before any AI request', async () => {
    const { orchestrator, provider, posts } = build();
    posts.assertNotPublishedDuplicate.mockRejectedValueOnce(new ConflictException('Duplicate: this photo was already published'));
    await expect(orchestrator.generateContent('u1', generateDto)).rejects.toBeInstanceOf(ConflictException);
    expect(provider.calls).toHaveLength(0);
    expect(posts.update).not.toHaveBeenCalled();
  });

  it('reuses the saved answer for the same photo and words, with no AI request', async () => {
    const { orchestrator, provider, posts, state } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    const first = await orchestrator.generateContent('u1', generateDto);
    expect(first).toMatchObject({ reused: false });
    const callsAfterFirst = provider.calls.length;

    state.status = 'DRAFT'; // a new draft with the same photo
    const second = await orchestrator.generateContent('u1', { ...generateDto, transcript: '  NEW cotton kurtis aaye hain.  Ek attractive post banao. ' });
    expect(second).toMatchObject({ reused: true, postStatus: 'PREVIEW_READY', headline: (first as { headline: string }).headline });
    expect(provider.calls).toHaveLength(callsAfterFirst);
    expect(posts.update).toHaveBeenCalledTimes(2);
  });

  it('asks the model again when the words change, even for the same photo', async () => {
    const { orchestrator, provider, state } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    await orchestrator.generateContent('u1', generateDto);
    const before = provider.calls.length;
    state.status = 'DRAFT';
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    const second = await orchestrator.generateContent('u1', { ...generateDto, transcript: 'Ab price 499 rupees hai, naya post banao' });
    expect(second).toMatchObject({ reused: false });
    expect(provider.calls.length).toBeGreaterThan(before);
  });

  it('never approves or publishes: only read, edit and the two safe moves are ever used', async () => {
    const { orchestrator, provider, posts } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    await orchestrator.generateContent('u1', generateDto);
    const targets = posts.moveTo.mock.calls.map((c) => c[1]);
    for (const forbidden of ['USER_APPROVED', 'PUBLISHING', 'PUBLISHED']) expect(targets).not.toContain(forbidden);
    // The strict stand-in would have thrown on posts.publish, posts.approve and so on.
  });

  it('returns content without saving anything when no post is given', async () => {
    const { orchestrator, provider, posts } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    const result = await orchestrator.generateContent('u1', { conversationId: 'conv-1', tone: 'friendly', hashtagLevel: 'few', transcript: 'New kurtis aaye hain' });
    expect(result).toMatchObject({ postId: null, postStatus: null });
    expect(posts.update).not.toHaveBeenCalled();
    expect(posts.moveTo).not.toHaveBeenCalled();
  });

  it('asks the owner a question instead of generating when an essential fact is missing', async () => {
    const { orchestrator, provider, posts, conversations } = build();
    provider.queue('intent', intentReply({ requiresClarification: true, clarificationQuestion: 'कितने प्रतिशत की छूट है?' }));
    const result = await orchestrator.generateContent('u1', { ...generateDto, transcript: 'Sale ka post banao' });
    expect(result).toMatchObject({ requiresClarification: true, clarificationQuestion: 'कितने प्रतिशत की छूट है?' });
    expect(provider.callsFor('content')).toHaveLength(0);
    expect(posts.update).not.toHaveBeenCalled();
    expect(conversations.addAssistantMessage).toHaveBeenCalledWith('conv-1', expect.objectContaining({ content: 'कितने प्रतिशत की छूट है?' }));
  });

  it("does nothing, and calls no model, for a conversation that isn't the owner's", async () => {
    const { orchestrator, provider, ctxService } = build();
    ctxService.built.mockRejectedValue(new NotFoundException('Conversation not found'));
    await expect(orchestrator.generateContent('u1', generateDto)).rejects.toBeInstanceOf(NotFoundException);
    await expect(orchestrator.classifyIntent('u1', { conversationId: 'c', transcript: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(provider.calls).toHaveLength(0);
  });

  it('refuses a post from another conversation or one already approved, before any model call', async () => {
    const other = build({ post: { id: 'post-1', status: 'DRAFT', conversationId: 'other-conv' } });
    await expect(other.orchestrator.generateContent('u1', generateDto)).rejects.toBeInstanceOf(BadRequestException);
    const approved = build({ post: { id: 'post-1', status: 'USER_APPROVED', conversationId: 'conv-1' } });
    await expect(approved.orchestrator.generateContent('u1', generateDto)).rejects.toBeInstanceOf(ConflictException);
    expect(other.provider.calls).toHaveLength(0);
    expect(approved.provider.calls).toHaveLength(0);
  });

  it('rejects an image that is not one of the shop\'s uploads before any model call', async () => {
    const { orchestrator, provider, posts } = build();
    for (const imageUrl of ['https://evil.example.com/a.png', 'https://169.254.169.254/latest/meta-data/']) {
      await expect(orchestrator.generateContent('u1', { ...generateDto, imageUrl })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(provider.callsFor('content')).toHaveLength(0);
    expect(posts.update).not.toHaveBeenCalled();
  });

  it('still succeeds when the conversation summary fails', async () => {
    const { orchestrator, provider } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()); // no summary reply queued -> summary call fails
    await expect(orchestrator.generateContent('u1', generateDto)).resolves.toMatchObject({ requiresClarification: false });
  });

  it('writes the compact summary into the conversation as a system message', async () => {
    const { orchestrator, provider, conversationsRepo } = build();
    provider.queue('intent', intentReply()).queue('content', contentReply()).queue('summary', summaryReply);
    await orchestrator.generateContent('u1', generateDto);
    expect(conversationsRepo.appendMessage).toHaveBeenCalledWith(expect.any(String), 'conv-1', expect.objectContaining({ role: 'system', metadata: expect.objectContaining({ kind: 'summary' }) }));
  });

  describe('editContent', () => {
    const draftPost = (status = 'PREVIEW_READY') => ({
      id: 'post-1',
      status,
      conversationId: 'conv-1',
      headline: 'New cotton kurtis are here!',
      caption: 'Discover our cotton kurti collection, now at ₹899.',
      callToAction: 'Visit us today!',
      hashtags: ['#CottonKurtis'],
      language: 'en',
    });
    const dto = { conversationId: 'conv-1', postId: 'post-1', instruction: 'Make it shorter and use Marathi. Remove the price.' };
    const marathi = editedReply({
      language: 'mr',
      headline: 'नवीन कॉटन कुर्ती!',
      caption: 'आमचे नवीन कलेक्शन आता उपलब्ध आहे.',
      callToAction: 'आजच भेट द्या!',
      posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'नवीन कलेक्शन', priceText: null, ctaText: 'आजच भेट द्या!' },
      changesApplied: ['Shortened the caption', 'Translated to Marathi', 'Removed the price'],
    });

    it('plans with Haiku, edits with Sonnet, saves the full draft, and keeps the post status', async () => {
      const { orchestrator, provider, posts, conversations } = build({ post: draftPost() });
      provider.queue('edit-plan', planReply({ operations: ['SHORTEN', 'CHANGE_LANGUAGE', 'REMOVE_PRICE'], targetLanguage: 'mr' })).queue('edit', marathi).queue('summary', summaryReply);
      const result = await orchestrator.editContent('u1', dto);

      expect(result).toMatchObject({ requiresClarification: false, language: 'mr', postId: 'post-1', postStatus: 'PREVIEW_READY' });
      expect(result.requiresClarification === false && result.changesApplied).toEqual(['Shortened the caption', 'Translated to Marathi', 'Removed the price']);
      expect(result.requiresClarification === false && result.posterSpecification.priceText).toBeNull();
      expect(posts.update).toHaveBeenCalledWith('u1', 'post-1', expect.objectContaining({ language: 'mr', caption: 'आमचे नवीन कलेक्शन आता उपलब्ध आहे.' }));
      expect(posts.moveTo).not.toHaveBeenCalled(); // an edit never changes the approval state
      expect(conversations.addUserMessage).toHaveBeenCalledWith('u1', 'conv-1', expect.objectContaining({ content: dto.instruction }));
      expect(provider.calls.map((c) => c.task)).toEqual(expect.arrayContaining(['edit-plan', 'edit']));
    });

    it('refuses to edit an approved post or one with no draft yet', async () => {
      const approved = build({ post: draftPost('USER_APPROVED') });
      await expect(approved.orchestrator.editContent('u1', dto)).rejects.toBeInstanceOf(ConflictException);
      const empty = build();
      await expect(empty.orchestrator.editContent('u1', dto)).rejects.toThrow('no draft to edit');
      expect(approved.provider.calls).toHaveLength(0);
      expect(empty.provider.calls).toHaveLength(0);
    });

    it('asks a question and changes nothing when the instruction is too vague', async () => {
      const { orchestrator, provider, posts } = build({ post: draftPost() });
      provider.queue('edit-plan', planReply({ requiresClarification: true, clarificationQuestion: 'What should I change?' }));
      const result = await orchestrator.editContent('u1', { ...dto, instruction: 'Make it better somehow' });
      expect(result).toMatchObject({ requiresClarification: true, clarificationQuestion: 'What should I change?' });
      expect(provider.callsFor('edit')).toHaveLength(0);
      expect(posts.update).not.toHaveBeenCalled();
    });

    it("refuses another owner's post without calling a model", async () => {
      const { orchestrator, provider } = build({ post: null });
      await expect(orchestrator.editContent('u1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(provider.calls).toHaveLength(0);
    });
  });

  it('keeps entities from the owner\'s words only (no invented price reaches Sonnet)', async () => {
    const { orchestrator, provider } = build();
    provider.queue('intent', intentReply({ entities: entities({ price: '599' }) })).queue('content', contentReply()).queue('summary', summaryReply);
    await orchestrator.generateContent('u1', generateDto);
    expect(provider.callsFor('content')[0].user).toContain('"priceToUse": null');
  });
});
