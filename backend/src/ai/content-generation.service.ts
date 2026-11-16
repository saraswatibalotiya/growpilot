import { Injectable } from '@nestjs/common';
import type { BusinessContext } from './business-context.service';
import { ClaudeProviderService } from './claude-provider.service';
import { allowedNumbers, cleanHashtags, cleanPrice, scriptMatches, unsupportedNumbers } from './facts';
import { PromptBuilderService } from './prompt-builder.service';
import { withRepair } from './repair';
import { ContentSchema, type Entities, type GeneratedContent, type ImageAnalysis, type Language } from './schemas';
import { BusinessContextService } from './business-context.service';
import { HASHTAG_COUNTS, type CaptionLength, type HashtagLevel, type Tone } from '../common/constants';
import { POST_CAPTION_GUIDES, TONE_GUIDES } from './prompts/v1/tones';

export interface GenerationInput {
  ctx: BusinessContext;
  transcript: string;
  language: Language;
  tone: Tone;
  captionLength: CaptionLength;
  hashtagLevel: HashtagLevel;
  /** Already grounded in the transcript. */
  entities: Entities;
  imageAnalysis: ImageAnalysis | null;
}

/**
 * Writes new marketing content with Sonnet, then checks it in code before it is returned:
 * right language, no numbers that did not come from the owner or the records, valid hashtags, and a poster
 * specification that only shows a price (or an offer template) when the facts support it.
 */
@Injectable()
export class ContentGenerationService {
  constructor(
    private readonly provider: ClaudeProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly context: BusinessContextService,
  ) {}

  /** The price the content may use: what the owner just said, otherwise the product record, otherwise none. */
  effectivePrice(input: Pick<GenerationInput, 'ctx' | 'entities'>): string | null {
    return cleanPrice(input.entities.price) ?? input.ctx.product?.price ?? null;
  }

  async generate(input: GenerationInput): Promise<GeneratedContent> {
    const { ctx, entities, language } = input;
    const price = this.effectivePrice(input);
    const allowed = allowedNumbers([
      input.transcript,
      price,
      ctx.product?.name,
      ctx.product?.description,
      ctx.business.name,
      ctx.business.description,
      ctx.business.targetAudience,
    ]);

    const facts = this.context.factsJson(ctx, { priceToUse: price, offerToUse: entities.discount });
    const ownerStated = JSON.stringify(entities);
    const analysis = input.imageAnalysis ? JSON.stringify(input.imageAnalysis) : null;

    const content = await withRepair(
      (note) => {
        const prompt = this.prompts.content({ language, transcript: input.transcript, verifiedFacts: facts, imageAnalysis: analysis, ownerStated, tone: `${input.tone} (${TONE_GUIDES[input.tone]})`, captionSize: POST_CAPTION_GUIDES[input.captionLength], hashtagCount: `${HASHTAG_COUNTS[input.hashtagLevel].min} to ${HASHTAG_COUNTS[input.hashtagLevel].max}`, repairNote: note });
        return this.provider.parse({ task: 'content', system: prompt.system, user: prompt.user, schema: ContentSchema });
      },
      (c) => this.check(c, language, allowed, input.hashtagLevel),
    );
    return this.finalise(content, language, price, entities, input.hashtagLevel);
  }

  private check(c: GeneratedContent, language: Language, allowed: Set<string>, hashtagLevel: HashtagLevel): string | null {
    if (c.requiresClarification) return c.clarificationQuestion?.trim() ? null : 'You asked for clarification but gave no question.';
    if (!c.headline.trim() || !c.caption.trim() || !c.callToAction.trim()) return 'The headline, caption and call to action must all be filled in.';
    if (c.language !== language) return `The language must be "${language}".`;
    const text = [c.headline, c.caption, c.callToAction, c.posterSpecification.headline, c.posterSpecification.ctaText];
    if (!scriptMatches(language, text.join(' '))) return `All text must be written in the requested language (${language}).`;
    const bad = unsupportedNumbers([...text, c.posterSpecification.priceText, ...c.hashtags, c.productUnderstanding.name, c.productUnderstanding.category], allowed);
    if (bad.length > 0) return `These numbers were not provided by the owner or the records, so remove them: ${bad.join(', ')}.`;
    const { min, max } = HASHTAG_COUNTS[hashtagLevel];
    if (cleanHashtags(c.hashtags, max).length < min) return `Provide ${min} to ${max} valid hashtags.`;
    return null;
  }

  /** Facts come from the records and the owner, never from the model: the model may only choose whether to show them. */
  private finalise(c: GeneratedContent, language: Language, price: string | null, entities: Entities, hashtagLevel: HashtagLevel): GeneratedContent {
    const showPrice = price !== null && c.posterSpecification.priceText !== null;
    return {
      ...c,
      language,
      hashtags: cleanHashtags(c.hashtags, HASHTAG_COUNTS[hashtagLevel].max),
      productUnderstanding: { ...c.productUnderstanding, price },
      posterSpecification: {
        ...c.posterSpecification,
        priceText: showPrice ? `₹${price}` : null,
        // An offer poster is only valid when the owner actually gave an offer.
        template: entities.discount ? c.posterSpecification.template : 'boutique_new_arrival_01',
      },
      clarificationQuestion: c.requiresClarification ? c.clarificationQuestion : null,
    };
  }
}
