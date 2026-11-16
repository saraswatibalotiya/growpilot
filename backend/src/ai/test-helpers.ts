// Shared fixtures for the AI unit tests. Nothing here talks to Anthropic: model replies are canned.
import type { z } from 'zod';
import type { BusinessContext } from './business-context.service';
import type { ParseRequest } from './claude-provider.service';

/** Stands in for ClaudeProviderService. Replies are queued per task and validated against the real schema. */
export class FakeProvider {
  calls: Array<ParseRequest<z.ZodType>> = [];
  private queues = new Map<string, unknown[]>();

  queue(task: string, ...replies: unknown[]): this {
    this.queues.set(task, [...(this.queues.get(task) ?? []), ...replies]);
    return this;
  }

  callsFor(task: string) {
    return this.calls.filter((c) => c.task === task);
  }

  parse = async <S extends z.ZodType>(request: ParseRequest<S>): Promise<z.infer<S>> => {
    this.calls.push(request as unknown as ParseRequest<z.ZodType>);
    const next = this.queues.get(request.task)?.shift();
    if (next === undefined) throw new Error(`No canned reply queued for task "${request.task}"`);
    if (next instanceof Error) throw next;
    return request.schema.parse(next) as z.infer<S>;
  };
}

export function context(overrides: Partial<BusinessContext> = {}): BusinessContext {
  return {
    businessId: 'biz-1',
    business: {
      name: 'Shree Fashion Studio',
      category: 'clothing',
      description: 'Women\'s boutique',
      city: 'Mumbai',
      area: 'Andheri',
      targetAudience: 'Women 20-35',
      preferredLanguage: 'hi',
    },
    product: null,
    recentPosts: [],
    conversation: { id: 'conv-1', summary: null, recentMessages: [] },
    missing: ['current discount or offer', 'product record (none selected)'],
    ...overrides,
  };
}

export const entities = (over: Partial<{ productName: string | null; price: string | null; discount: string | null; tone: string | null }> = {}) => ({
  productName: 'Cotton kurtis',
  price: null,
  discount: null,
  tone: 'attractive',
  ...over,
});

export function intentReply(over: Record<string, unknown> = {}) {
  return {
    intent: 'CREATE',
    confidence: 0.96,
    language: 'hi',
    entities: entities(),
    requiresClarification: false,
    clarificationQuestion: null,
    ...over,
  };
}

export function contentReply(over: Record<string, unknown> = {}) {
  return {
    language: 'hi',
    productUnderstanding: { name: 'Cotton Kurti', category: 'Clothing', price: null },
    headline: 'नए कॉटन कुर्तियों का खूबसूरत कलेक्शन!',
    caption: 'आपके लिए पेश है हमारा नया कॉटन कुर्ती कलेक्शन। अपने पसंदीदा स्टाइल को चुनें!',
    callToAction: 'आज ही विजिट करें!',
    hashtags: ['#CottonKurtis', '#NewArrivals', '#EthnicWear'],
    posterSpecification: {
      template: 'boutique_new_arrival_01',
      theme: 'elegant',
      layout: 'product_center',
      headline: 'नया कलेक्शन आ गया है!',
      priceText: null,
      ctaText: 'आज ही विजिट करें!',
    },
    requiresClarification: false,
    clarificationQuestion: null,
    ...over,
  };
}

export function editedReply(over: Record<string, unknown> = {}) {
  return { ...contentReply(), changesApplied: ['Shortened the caption'], ...over };
}

export const planReply = (over: Record<string, unknown> = {}) => ({
  operations: ['SHORTEN'],
  targetLanguage: null,
  newPrice: null,
  requiresClarification: false,
  clarificationQuestion: null,
  ...over,
});
