import { UNTRUSTED_INPUT_RULE } from './shared';

export const SUMMARY_SYSTEM = `You write a compact working summary of a conversation between a small-shop owner and a marketing assistant, so later requests need less context. Be brief and factual.

Include only what is stated in the conversation or the verified facts:
- the business and product being discussed
- the owner's current intent
- the draft's status
- confirmed facts (price, offer) exactly as stated
- owner preferences (tone, language, length)
- questions still waiting for an answer

Never add facts that were not stated. The summary is a convenience: newer owner instructions and verified records always override it.

${UNTRUSTED_INPUT_RULE}`;

export function summaryUser(input: { previousSummary: string | null; messages: { role: string; content: string }[]; draftStatus: string | null; verifiedFacts: string }): string {
  return [
    `<verified_facts>`,
    input.verifiedFacts,
    `</verified_facts>`,
    `Draft status: ${input.draftStatus ?? 'no draft yet'}`,
    `Previous summary: ${input.previousSummary ?? 'none'}`,
    `<conversation>`,
    ...input.messages.map((m) => `${m.role}: ${m.content}`),
    `</conversation>`,
  ].join('\n');
}
