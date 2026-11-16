import { Injectable } from '@nestjs/common';
import type { BusinessContext } from './business-context.service';
import { BusinessContextService } from './business-context.service';
import { ClaudeProviderService } from './claude-provider.service';
import { allowedNumbers, cleanHashtags, cleanPrice, numbersIn, pricesMentioned, scriptMatches, unsupportedNumbers } from './facts';
import { PromptBuilderService } from './prompt-builder.service';
import { withRepair } from './repair';
import { EditedContentSchema, EditPlanSchema, type EditedContent, type EditPlan, type Language } from './schemas';

export interface Draft {
  headline: string | null;
  caption: string | null;
  callToAction: string | null;
  hashtags: string[] | null;
  language: Language | null;
}

export interface EditInput {
  ctx: BusinessContext;
  draft: Draft;
  instruction: string;
  plan: EditPlan;
}

/**
 * Edits an existing draft. Haiku turns the instruction into a plan, Sonnet applies it. The result must keep the
 * draft's confirmed facts, honour "remove the price", and stay in the right language, all verified in code.
 */
@Injectable()
export class ContentEditingService {
  constructor(
    private readonly provider: ClaudeProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly context: BusinessContextService,
  ) {}

  /** What the instruction asks for. A price is kept only if the owner really said it. */
  async plan(draft: Draft, instruction: string): Promise<EditPlan> {
    const summary = JSON.stringify({ language: draft.language, headline: draft.headline, caption: draft.caption, callToAction: draft.callToAction });
    const prompt = this.prompts.editPlan({ instruction, draftSummary: summary });
    const plan = await withRepair(
      (note) => this.provider.parse({ task: 'edit-plan', system: prompt.system, user: note ? `${prompt.user}\n${note}` : prompt.user, schema: EditPlanSchema }),
      () => null,
    );
    const newPrice = cleanPrice(plan.newPrice);
    const question = plan.requiresClarification ? plan.clarificationQuestion?.trim() || null : null;
    return {
      ...plan,
      newPrice: newPrice && numbersIn(instruction).includes(newPrice) ? newPrice : null,
      requiresClarification: plan.requiresClarification && question !== null,
      clarificationQuestion: question,
    };
  }

  /** The language the edited draft must be in. */
  outputLanguage(draft: Draft, plan: EditPlan, ctx: BusinessContext): Language {
    return plan.targetLanguage ?? draft.language ?? ctx.business.preferredLanguage ?? 'en';
  }

  /** The price currently in the draft, if any: from the text itself, else the linked product record. */
  currentPrice(draft: Draft, ctx: BusinessContext): string | null {
    const text = [draft.headline, draft.caption, draft.callToAction].filter(Boolean).join(' ');
    return pricesMentioned(text)[0] ?? ctx.product?.price ?? null;
  }

  async edit(input: EditInput): Promise<EditedContent & { price: string | null }> {
    const { ctx, draft, instruction, plan } = input;
    const language = this.outputLanguage(draft, plan, ctx);
    const removing = plan.operations.includes('REMOVE_PRICE');
    const current = this.currentPrice(draft, ctx);
    const price = removing ? null : (plan.newPrice ?? current);

    // Numbers that must not survive a price removal: the record price and any price the draft already shows.
    const removedPrices = removing ? [...new Set([...(current ? [current] : []), ...pricesMentioned([draft.headline, draft.caption, draft.callToAction].join(' '))])] : [];
    const draftText = [draft.headline, draft.caption, draft.callToAction, ...(draft.hashtags ?? [])].join(' ');
    const allowed = allowedNumbers([draftText, instruction, price, ctx.product?.name, ctx.product?.description, ctx.business.name, ...ctx.conversation.recentMessages.filter((m) => m.role === 'user').map((m) => m.content)]);
    for (const p of removedPrices) allowed.delete(p);

    const facts = this.context.factsJson(ctx, { priceToUse: price, priceRemoved: removing });
    const draftJson = JSON.stringify(draft);
    const planText = plan.operations.join(', ') || 'OTHER';

    const edited = await withRepair(
      (note) => {
        const prompt = this.prompts.edit({ draft: draftJson, instruction, plan: planText, verifiedFacts: facts, language, repairNote: note });
        return this.provider.parse({ task: 'edit', system: prompt.system, user: prompt.user, schema: EditedContentSchema });
      },
      (c) => this.check(c, language, allowed, removedPrices),
    );

    return {
      ...edited,
      language,
      hashtags: cleanHashtags(edited.hashtags, 12),
      price,
      productUnderstanding: { ...edited.productUnderstanding, price },
      posterSpecification: { ...edited.posterSpecification, priceText: price !== null && edited.posterSpecification.priceText !== null ? `₹${price}` : null },
      changesApplied: edited.changesApplied.map((c) => c.trim()).filter(Boolean).slice(0, 8),
      clarificationQuestion: edited.requiresClarification ? edited.clarificationQuestion : null,
    };
  }

  private check(c: EditedContent, language: Language, allowed: Set<string>, removedPrices: string[]): string | null {
    if (c.requiresClarification) return c.clarificationQuestion?.trim() ? null : 'You asked for clarification but gave no question.';
    if (!c.headline.trim() || !c.caption.trim() || !c.callToAction.trim()) return 'The headline, caption and call to action must all be filled in.';
    if (c.language !== language) return `The language must be "${language}".`;
    const text = [c.headline, c.caption, c.callToAction, c.posterSpecification.headline, c.posterSpecification.ctaText];
    if (!scriptMatches(language, text.join(' '))) return `All text must be written in the requested language (${language}).`;
    const all = [...text, c.posterSpecification.priceText, ...c.hashtags];
    const leftover = removedPrices.filter((p) => all.some((t) => t && numbersIn(t).includes(p)));
    if (leftover.length > 0) return `The price (${leftover.join(', ')}) must be removed from every field, including the poster text.`;
    const bad = unsupportedNumbers(all, allowed);
    if (bad.length > 0) return `These numbers were not in the draft or provided by the owner, so remove them: ${bad.join(', ')}.`;
    if (cleanHashtags(c.hashtags).length === 0) return 'Provide 3 to 6 valid hashtags.';
    return null;
  }
}
