import { Injectable } from '@nestjs/common';
import type { BusinessContext } from './business-context.service';
import { ClaudeProviderService } from './claude-provider.service';
import { cleanPrice, numbersIn } from './facts';
import { PromptBuilderService } from './prompt-builder.service';
import { withRepair } from './repair';
import { IntentResultSchema, type Entities, type IntentResult } from './schemas';

/**
 * Drops anything the model "extracted" that the owner did not actually say. A price must appear in the transcript,
 * and a discount's numbers must too. This is the guard that keeps invented prices and offers out of the pipeline.
 */
export function groundEntities(entities: Entities, transcript: string): Entities {
  const said = new Set(numbersIn(transcript));
  const price = cleanPrice(entities.price);
  const discount = entities.discount?.trim() || null;
  let grounded: string | null = null;
  if (discount) {
    const nums = numbersIn(discount);
    const lowered = transcript.toLowerCase();
    const wordsSaid = discount
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .some((w) => lowered.includes(w));
    if (nums.length > 0 ? nums.every((n) => said.has(n)) : wordsSaid) grounded = discount;
  }
  return {
    productName: entities.productName?.trim() || null,
    price: price && said.has(price) ? price : null,
    discount: grounded,
    tone: entities.tone?.trim() || null,
  };
}

@Injectable()
export class IntentClassificationService {
  constructor(
    private readonly provider: ClaudeProviderService,
    private readonly prompts: PromptBuilderService,
  ) {}

  /** `extraction` mode uses the lighter product-extraction prompt before content generation. */
  async classify(ctx: BusinessContext, transcript: string, mode: 'intent' | 'extraction' = 'intent'): Promise<IntentResult> {
    const input = {
      transcript,
      preferredLanguage: ctx.business.preferredLanguage,
      summary: ctx.conversation.summary ? JSON.stringify(ctx.conversation.summary) : null,
    };
    const prompt = mode === 'intent' ? this.prompts.intent(input) : this.prompts.extraction(input);

    const raw = await withRepair(
      (note) =>
        this.provider.parse({
          task: 'intent',
          system: prompt.system,
          user: note ? `${prompt.user}\n${note}` : prompt.user,
          schema: IntentResultSchema,
        }),
      () => null,
    );

    const confidence = Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0;
    const question = raw.requiresClarification ? raw.clarificationQuestion?.trim() || null : null;
    return {
      intent: raw.intent,
      confidence,
      language: raw.language ?? ctx.business.preferredLanguage ?? null,
      entities: groundEntities(raw.entities, transcript),
      // A clarification with no question is not actionable, so it is treated as no clarification.
      requiresClarification: raw.requiresClarification && question !== null,
      clarificationQuestion: question,
    };
  }
}
