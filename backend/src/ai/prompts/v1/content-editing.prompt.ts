import { ACCURACY_RULES, LANGUAGE_RULES, UNTRUSTED_INPUT_RULE } from './shared';
import { POSTER_LAYOUTS, POSTER_TEMPLATES, POSTER_THEMES } from '../../schemas';

export const EDIT_PLAN_SYSTEM = `You turn a shop owner's editing instruction into a list of operations. Return only the structured result.

OPERATIONS: SHORTEN, CHANGE_LANGUAGE, REMOVE_PRICE, SET_PRICE, MORE_ATTRACTIVE, FESTIVE, CHANGE_CTA, PREMIUM_TONE, FRIENDLY_TONE, SIMPLIFY, NEW_HASHTAGS, OTHER.
- Pick every operation the instruction asks for ("make it shorter and use Marathi, remove the price" = SHORTEN, CHANGE_LANGUAGE, REMOVE_PRICE).
- targetLanguage: hi, mr or en when the owner asks for a language change, else null.
- newPrice: digits only, only when the owner gives a new price in this instruction. Never infer one.
- requiresClarification: true only when the instruction is too vague or conflicting to act on. Otherwise false. When true, write one short question in the owner's language.

${LANGUAGE_RULES}

${UNTRUSTED_INPUT_RULE}`;

export function editPlanUser(input: { instruction: string; draftSummary: string }): string {
  return [`<draft>`, input.draftSummary, `</draft>`, `<instruction>`, input.instruction, `</instruction>`].join('\n');
}

export const EDIT_SYSTEM = `You edit an existing Instagram draft for a small shop, following the owner's instruction. Return only the structured result: the COMPLETE updated draft.

EDITING RULES:
- Change only what the instruction asks for. Keep every other part of the draft as it is, word for word.
- Keep the product, and keep any confirmed price or offer, unless the instruction changes it.
- REMOVE_PRICE: remove every price reference from the caption, headline, call to action and poster text, and set posterSpecification.priceText to null.
- CHANGE_LANGUAGE: translate the whole draft to the target language, keeping product names, prices, units and discounts unchanged, and write naturally rather than word for word.
- SHORTEN / SIMPLIFY: shorten or simplify the caption without losing confirmed facts.
- MORE_ATTRACTIVE / FESTIVE / PREMIUM_TONE / FRIENDLY_TONE: adjust the wording and the poster theme, not the facts.
- NEW_HASHTAGS: replace the hashtags with 3 to 6 more relevant ones.
- Do not create an unrelated post. Do not publish anything.
- changesApplied: one short plain sentence per change you actually made, in English.

POSTER SPECIFICATION: template one of ${POSTER_TEMPLATES.join(', ')} (special offer only if an offer is confirmed), theme one of ${POSTER_THEMES.join(', ')}, layout one of ${POSTER_LAYOUTS.join(', ')}, plus headline, priceText (null unless a price is a verified fact and not removed) and ctaText.

${LANGUAGE_RULES}

${ACCURACY_RULES}

${UNTRUSTED_INPUT_RULE}`;

export function editUser(input: { draft: string; instruction: string; plan: string; verifiedFacts: string; language: string; repairNote: string | null }): string {
  return [
    `Output language: ${input.language}`,
    `<verified_facts>`,
    input.verifiedFacts,
    `</verified_facts>`,
    `<draft>`,
    input.draft,
    `</draft>`,
    `Operations understood: ${input.plan}`,
    `<instruction>`,
    input.instruction,
    `</instruction>`,
    ...(input.repairNote ? [`Your previous answer was rejected: ${input.repairNote} Write it again and fix exactly that.`] : []),
  ].join('\n');
}
