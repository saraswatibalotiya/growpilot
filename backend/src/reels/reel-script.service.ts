import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { allowedNumbers, cleanHashtags, scriptMatches, unsupportedNumbers } from '../ai/facts';
import { ClaudeProviderService } from '../ai/claude-provider.service';
import { REEL_CAPTION_GUIDES, TONE_GUIDES } from '../ai/prompts/v1/tones';
import { withRepair } from '../ai/repair';
import { HASHTAG_COUNTS, type CaptionLength, type HashtagLevel, type Tone } from '../common/constants';
import { REEL_SECONDS, type ReelLanguage, type ReelScene } from './reels.constants';

export const ReelScriptSchema = z.object({
  script: z.string(),
  scenes: z.array(z.object({ label: z.string(), text: z.string() })),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

export interface ReelScriptInput {
  language: ReelLanguage;
  template: string;
  tone: Tone;
  captionLength: CaptionLength;
  hashtagLevel: HashtagLevel;
  productName: string;
  price: string | null;
  offerText: string | null;
  businessName: string;
  instruction: string | null;
  /** Reel length in seconds. Default 10. */
  duration?: number;
  /** Set when the owner asked for a shorter script. */
  shorterThan?: string | null;
}

export interface ReelScriptResult {
  script: string;
  scenes: ReelScene[];
  caption: string;
  hashtags: string[];
}

const LANGUAGE_NAME: Record<ReelLanguage, string> = { hi: 'Hindi (Devanagari script)', mr: 'Marathi (Devanagari script)', en: 'Indian English' };
/** Spoken words per second, roughly, for the TTS voices. */
const WORDS_PER_SECOND: Record<ReelLanguage, number> = { en: 2.5, hi: 2.25, mr: 2.25 };

/** Accepted word range for a Reel of `duration` seconds (10 s: about 18-32 in English). */
export function wordRange(language: ReelLanguage, duration: number): [number, number] {
  const target = WORDS_PER_SECOND[language] * (duration - 0.5);
  return [Math.round(target * 0.76), Math.round(target * 1.35)];
}
const targetWords = (language: ReelLanguage, duration: number): [number, number] => {
  const t = WORDS_PER_SECOND[language] * (duration - 0.5);
  return [Math.round(t * 0.92), Math.round(t * 1.18)];
};

export const REEL_SCRIPT_SYSTEM = `You write the voiceover, on-screen text, caption and hashtags for a short Instagram Reel for a small Indian shop.
Rules, all mandatory:
- Use ONLY these facts: product name, price, offer text, shop name and the owner's instruction. Never invent materials, colours, sizes, quality claims, prices, discounts, offers, stock, delivery, dates or locations.
- Mention a price only if a price is given; mention an offer only if offer text is given. If neither is given, do not mention money, discounts, sales or offers at all.
- Write in the requested language and script. Hindi and Marathi must be in Devanagari, with no English letters except the shop or product name if it is written that way.
- The voiceover must fit the Reel length given in the request, using about the word count given there. Natural, warm spoken sentences; no emojis, no hashtags, no stage directions.
- Give 3 or 4 scenes. Each scene has a short internal label and on-screen text of at most 6 words, taken from the facts. Scenes follow the voiceover in order. Every scene's text must be different from the others and must not just repeat the product name or shop name; the last scene may be a short call to action.
- The call to action, in the voiceover and in the last scene, is always to message the shop: "DM now" in English, "अभी DM करें" in Hindi, "आता DM करा" in Marathi. NEVER tell people to visit, come to or stop by the shop or store, and never mention walking in.
- The caption is for Instagram, in the same language, with no hashtags in it, at exactly the caption length given in the request.
- Give exactly the number of hashtags given in the request, relevant to the product and shop, each starting with #.
Return only the structured result.`;

export function reelScriptUser(input: ReelScriptInput, problem?: string | null): string {
  const duration = input.duration ?? REEL_SECONDS;
  const [lo, hi] = targetWords(input.language, duration);
  const lines = [
    `Reel length: ${duration} seconds; voiceover of about ${lo} to ${hi} words`,
    `Language: ${LANGUAGE_NAME[input.language]}`,
    `Template style: ${input.template}`,
    `Tone: ${input.tone} (${TONE_GUIDES[input.tone]})`,
    `Caption length: ${REEL_CAPTION_GUIDES[input.captionLength]}`,
    `Number of hashtags: ${HASHTAG_COUNTS[input.hashtagLevel].min} to ${HASHTAG_COUNTS[input.hashtagLevel].max}`,
    `Product name: ${input.productName}`,
    `Price: ${input.price ?? 'not provided'}`,
    `Offer text: ${input.offerText ?? 'not provided'}`,
    `Shop name: ${input.businessName}`,
    `Owner's instruction: ${input.instruction ?? 'none'}`,
  ];
  if (input.shorterThan) lines.push(`Make it clearly shorter than this earlier voiceover (about 20 percent fewer words): ${input.shorterThan}`);
  if (problem) lines.push(`Your previous answer was rejected: ${problem} Fix exactly that.`);
  return lines.join('\n');
}

const MONEY = /₹|\brs\.?\b|rupee|रुपय|रुपये|रू\b/i;
const OFFER_WORDS = /\b(discounts?|sale|offers?|off|free delivery)\b|छूट|ऑफर|सेल|सवलत|मोफत|फ्री/i;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Null when the script is usable, otherwise what is wrong (fed back to the model once). */
export function checkReelScript(out: z.infer<typeof ReelScriptSchema>, input: ReelScriptInput): string | null {
  const [min, max] = wordRange(input.language, input.duration ?? REEL_SECONDS);
  const count = words(out.script);
  if (count < min || count > max) return `The voiceover has ${count} words; it must have ${min} to ${max}.`;
  if (out.scenes.length < 3 || out.scenes.length > 4) return 'There must be 3 or 4 scenes.';
  if (out.scenes.some((s) => !s.text.trim() || words(s.text) > 8)) return 'Every scene needs on-screen text of at most 6 words.';
  if (!out.caption.trim()) return 'The caption is empty.';
  const spoken = [out.script, out.caption, ...out.scenes.map((s) => s.text)];
  if (!spoken.every((t) => scriptMatches(input.language, t))) return `All text must be written in ${LANGUAGE_NAME[input.language]}.`;
  const allowed = allowedNumbers([input.price, input.offerText, input.productName, input.businessName, input.instruction]);
  const bad = unsupportedNumbers(spoken, allowed);
  if (bad.length) return `It contains numbers that were not provided: ${bad.join(', ')}.`;
  if (!input.price && spoken.some((t) => MONEY.test(t))) return 'It mentions money but no price was provided.';
  if (!input.offerText && spoken.some((t) => OFFER_WORDS.test(t))) return 'It mentions a discount or offer but none was provided.';
  const tags = HASHTAG_COUNTS[input.hashtagLevel];
  if (cleanHashtags(out.hashtags, tags.max).length < tags.min) return `Give ${tags.min} to ${tags.max} valid hashtags.`;
  return null;
}

/** Even scene timing inside the Reel, with a short lead-in and tail. */
export function timeScenes(items: Array<{ label: string; text: string }>, duration: number = REEL_SECONDS): ReelScene[] {
  const lead = 0.4;
  const span = (duration - lead - 0.3) / items.length;
  return items.map((item, i) => ({
    label: item.label.trim().slice(0, 40),
    text: item.text.trim(),
    startSec: round(lead + i * span),
    endSec: round(lead + (i + 1) * span),
  }));
}

const round = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ReelScriptService {
  private readonly logger = new Logger(ReelScriptService.name);

  constructor(private readonly provider: ClaudeProviderService) {}

  async write(input: ReelScriptInput): Promise<ReelScriptResult> {
    const out = await withRepair(
      (note) =>
        this.provider.parse({
          task: 'reel-script',
          system: REEL_SCRIPT_SYSTEM,
          user: reelScriptUser(input, note),
          schema: ReelScriptSchema,
        }),
      (value) => {
        const problem = checkReelScript(value, input);
        if (problem) this.logger.warn({ event: 'reel_script_rejected', problem });
        return problem;
      },
    );
    return {
      script: out.script.trim(),
      scenes: timeScenes(out.scenes, input.duration ?? REEL_SECONDS),
      caption: out.caption.trim(),
      hashtags: cleanHashtags(out.hashtags, HASHTAG_COUNTS[input.hashtagLevel].max),
    };
  }
}
