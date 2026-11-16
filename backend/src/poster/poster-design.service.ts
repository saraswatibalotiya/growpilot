import { Injectable, Logger } from '@nestjs/common';
import { AiOutputInvalidError, ClaudeProviderService } from '../ai/claude-provider.service';
import {
  acceptModelDesign,
  applyPatch,
  defaultTemplateFor,
  InvalidDesignError,
  ModelDesignSchema,
  ModelPatchSchema,
  templateDesign,
  type PosterDesign,
  type VerifiedFacts,
} from './poster-design';
import {
  POSTER_DESIGN_SYSTEM,
  POSTER_EDIT_SYSTEM,
  posterDesignUser,
  posterEditUser,
  type DesignPromptInput,
} from './poster.prompts';

export interface ClaudeUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface DesignOutcome {
  design: PosterDesign;
  notes: string[];
  /** "ai": Claude's design was used. "template": Claude's answer was unusable, so the template's own palette was used. */
  source: 'ai' | 'template';
  reasoning: string | null;
  usage: ClaudeUsage[];
}

export type EditOutcome =
  | { clarification: string; usage: ClaudeUsage[] }
  | { design: PosterDesign; notes: string[]; changesApplied: string[]; usage: ClaudeUsage[] };

/**
 * Claude's part: Sonnet looks at the photo and proposes a design, Haiku turns a short instruction into a small change.
 * Both return validated JSON that describes layout and colour only. Nothing here touches pixels, and neither model is
 * ever given (or asked for) a price. Claude errors (no key, rate limit, timeout) are not hidden: they propagate.
 */
@Injectable()
export class PosterDesignService {
  private readonly logger = new Logger(PosterDesignService.name);

  constructor(private readonly provider: ClaudeProviderService) {}

  async design(input: {
    imageUrl: string;
    prompt: DesignPromptInput;
    facts: VerifiedFacts;
    text: { headline: string; callToAction: string };
    forceTemplate?: PosterDesign['template'];
  }): Promise<DesignOutcome> {
    const usage: ClaudeUsage[] = [];
    const context = { text: input.text, facts: input.facts, category: input.prompt.category, shopName: input.prompt.shopName };
    let problems: string[] | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const proposal = await this.provider.parse({
          task: 'poster-design',
          system: POSTER_DESIGN_SYSTEM,
          user: posterDesignUser(input.prompt, problems),
          images: [{ type: 'url', url: input.imageUrl }],
          schema: ModelDesignSchema,
          onUsage: (u) => usage.push(u),
        });
        const accepted = acceptModelDesign(proposal, context);
        // The Cover Card is the house look; the AI's palette is only kept for offers or when the owner forced a template.
        const template = input.forceTemplate ?? (input.facts.offer ? undefined : 'cover_card');
        const design = template ? this.withTemplate(accepted.design, template, input.facts) : accepted.design;
        return { design, notes: accepted.notes, source: 'ai', reasoning: proposal.reasoning.slice(0, 240) || null, usage };
      } catch (error) {
        if (error instanceof InvalidDesignError) {
          problems = error.problems;
          this.logger.warn({ event: 'poster_design_invalid', attempt });
          continue;
        }
        if (error instanceof AiOutputInvalidError) {
          problems = [error.message];
          this.logger.warn({ event: 'poster_design_unparseable', attempt });
          continue;
        }
        throw error; // auth, rate limit, timeout, refusal: reported as they are
      }
    }

    // Two unusable answers. The owner still gets a good poster from the template's own palette, and is told.
    const template = input.forceTemplate ?? defaultTemplateFor(input.prompt.category, !!input.facts.offer);
    return {
      design: templateDesign(template, input.text, !!input.facts.price),
      notes: ['The AI design was not usable this time, so a standard layout was used. You can try "Regenerate design".'],
      source: 'template',
      reasoning: null,
      usage,
    };
  }

  private withTemplate(design: PosterDesign, template: PosterDesign['template'], facts: VerifiedFacts): PosterDesign {
    if (template === design.template) return design;
    if (template === 'offer_poster' && !facts.offer) return design;
    return templateDesign(template, { headline: design.headline, callToAction: design.callToAction }, design.showPrice);
  }

  async edit(input: { design: PosterDesign; instruction: string; facts: VerifiedFacts }): Promise<EditOutcome> {
    const usage: ClaudeUsage[] = [];
    let problems: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const patch = await this.provider.parse({
          task: 'poster-edit',
          system: POSTER_EDIT_SYSTEM,
          user: posterEditUser({ design: input.design, instruction: input.instruction, offerProvided: !!input.facts.offer, priceAvailable: !!input.facts.price }) + (problems ? `\nYour previous answer was rejected: ${problems.join('; ')}. Fix exactly that.` : ''),
          schema: ModelPatchSchema,
          onUsage: (u) => usage.push(u),
        });
        if (patch.requiresClarification && patch.clarificationQuestion) return { clarification: patch.clarificationQuestion, usage };
        const applied = applyPatch(input.design, patch, input.facts);
        return { design: applied.design, notes: applied.notes, changesApplied: patch.changesApplied, usage };
      } catch (error) {
        if (error instanceof InvalidDesignError) {
          problems = error.problems;
          continue;
        }
        if (error instanceof AiOutputInvalidError) {
          problems = [error.message];
          continue;
        }
        throw error;
      }
    }
    return { clarification: "I couldn't apply that change. Could you say it a little differently?", usage };
  }
}
