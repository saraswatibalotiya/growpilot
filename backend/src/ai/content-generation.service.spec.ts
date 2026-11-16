import { BadGatewayException } from '@nestjs/common';
import { BusinessContextService } from './business-context.service';
import { AiOutputInvalidError, type ClaudeProviderService } from './claude-provider.service';
import { ContentGenerationService } from './content-generation.service';
import { PromptBuilderService } from './prompt-builder.service';
import { context, contentReply, entities, FakeProvider } from './test-helpers';

// factsJson uses no dependencies, so the repositories can be absent here.
const contextService = new BusinessContextService(null as never, null as never, null as never, null as never);

function build() {
  const provider = new FakeProvider();
  return { provider, service: new ContentGenerationService(provider as unknown as ClaudeProviderService, new PromptBuilderService(), contextService) };
}

const input = (over: Record<string, unknown> = {}) => ({
  ctx: context(),
  transcript: 'New cotton kurtis aaye hain. Ek attractive post banao.',
  language: 'hi' as const,
  tone: 'friendly' as const,
  captionLength: 'medium' as const,
  hashtagLevel: 'few' as const,
  entities: entities(),
  imageAnalysis: null,
  ...over,
});

const english = () =>
  contentReply({
    language: 'en',
    headline: 'New cotton kurtis are here!',
    caption: 'Discover our new cotton kurti collection. Choose your favourite style.',
    callToAction: 'DM us today!',
    posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'New collection', priceText: null, ctaText: 'Visit us today!' },
  });

const marathi = () =>
  contentReply({
    language: 'mr',
    headline: 'नवीन कॉटन कुर्ती कलेक्शन!',
    caption: 'आमचे नवीन कॉटन कुर्ती कलेक्शन आता उपलब्ध आहे. तुमची आवडती स्टाइल निवडा!',
    callToAction: 'आजच भेट द्या!',
    posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'नवीन कलेक्शन', priceText: null, ctaText: 'आजच भेट द्या!' },
  });

describe('ContentGenerationService (Sonnet)', () => {
  it('writes English content', async () => {
    const { provider, service } = build();
    provider.queue('content', english());
    const out = await service.generate(input({ language: 'en' }));
    expect(out).toMatchObject({ language: 'en', headline: 'New cotton kurtis are here!' });
    expect(provider.callsFor('content')).toHaveLength(1);
  });

  it('writes Hindi content', async () => {
    const { provider, service } = build();
    provider.queue('content', contentReply());
    expect(await service.generate(input())).toMatchObject({ language: 'hi', hashtags: ['#CottonKurtis', '#NewArrivals', '#EthnicWear'] });
  });

  it('writes Marathi content', async () => {
    const { provider, service } = build();
    provider.queue('content', marathi());
    expect(await service.generate(input({ language: 'mr' }))).toMatchObject({ language: 'mr', callToAction: 'आजच भेट द्या!' });
  });

  it('sends the rules, the verified facts and the owner words in the right places', async () => {
    const { provider, service } = build();
    provider.queue('content', contentReply());
    await service.generate(input());
    const sent = provider.callsFor('content')[0];
    expect(sent.system).toContain('NEVER invent or guess: prices, discounts or offers');
    expect(sent.user).toContain('<verified_facts>');
    expect(sent.user).toContain('"notProvided"');
    expect(sent.user).toContain('<owner_message>\nNew cotton kurtis aaye hain. Ek attractive post banao.\n</owner_message>');
    expect(sent.user).toContain('Write the content in this language: hi');
  });

  it('tells the model the tone the owner picked for this post, with what it means', async () => {
    const { provider, service } = build();
    provider.queue('content', contentReply());
    await service.generate(input({ tone: 'local' }));
    expect(provider.callsFor('content')[0].user).toContain('Tone: local (everyday neighbourhood-shop voice');
  });

  it('asks for the caption length and number of hashtags the owner chose', async () => {
    const { provider, service } = build();
    provider.queue('content', contentReply());
    await service.generate(input({ captionLength: 'long', hashtagLevel: 'few' }));
    const user = provider.callsFor('content')[0].user;
    expect(user).toContain('Caption length: 4 to 5 sentences');
    expect(user).toContain('Number of hashtags: 3 to 4');
  });

  it('works with missing business details by showing them as missing, not invented', async () => {
    const { provider, service } = build();
    provider.queue('content', contentReply());
    const bare = context({ business: { name: 'Shop', category: 'clothing', description: null, city: null, area: null, targetAudience: null, preferredLanguage: null } });
    await service.generate(input({ ctx: bare }));
    const user = provider.callsFor('content')[0].user;
    expect(user).toContain('"targetAudience": null');
    expect(user).toContain('"city": null');
  });

  it('leaves the price out when no price is known, and forces the poster price to null', async () => {
    const { provider, service } = build();
    const withPrice = contentReply({ posterSpecification: { ...contentReply().posterSpecification, priceText: '₹899' } });
    provider.queue('content', withPrice, contentReply());
    // 899 is not in the transcript or records: rejected once, then written without it.
    const out = await service.generate(input());
    expect(out.productUnderstanding.price).toBeNull();
    expect(out.posterSpecification.priceText).toBeNull();
    expect(provider.callsFor('content')).toHaveLength(2);
    expect(provider.callsFor('content')[1].user).toContain('899');
  });

  it('rejects an invented price, repairs once, and returns the corrected text', async () => {
    const { provider, service } = build();
    provider.queue('content', contentReply({ caption: 'अब सिर्फ ₹599 में नया कॉटन कुर्ती कलेक्शन!' }), contentReply());
    const out = await service.generate(input());
    expect(out.caption).not.toContain('599');
    expect(provider.callsFor('content')[1].user).toContain('599');
  });

  it('returns a safe error, not made-up content, if the model keeps inventing numbers', async () => {
    const { provider, service } = build();
    const bad = contentReply({ headline: 'नया कलेक्शन, 30% छूट!' });
    provider.queue('content', bad, bad);
    await expect(service.generate(input())).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('uses the product record price, formatted by us, as the verified price', async () => {
    const { provider, service } = build();
    const product = { id: 'p1', name: 'Cotton kurti', description: null, category: 'kurti', price: '899', isAvailable: true, imageUrl: null };
    provider.queue('content', contentReply({ productUnderstanding: { name: 'Cotton Kurti', category: 'Clothing', price: '1299' }, posterSpecification: { ...contentReply().posterSpecification, priceText: '₹899' } }));
    const out = await service.generate(input({ ctx: context({ product }) }));
    expect(out.productUnderstanding.price).toBe('899');
    expect(out.posterSpecification.priceText).toBe('₹899');
  });

  it('prefers a price the owner just said over the record', async () => {
    const { provider, service } = build();
    const product = { id: 'p1', name: 'Cotton kurti', description: null, category: null, price: '899', isAvailable: true, imageUrl: null };
    provider.queue('content', contentReply({ posterSpecification: { ...contentReply().posterSpecification, priceText: '₹799' } }));
    const out = await service.generate(input({ ctx: context({ product }), transcript: 'Kurti ab 799 rupees', entities: entities({ price: '799' }) }));
    expect(out.productUnderstanding.price).toBe('799');
    expect(out.posterSpecification.priceText).toBe('₹799');
  });

  it('uses the offer poster only when the owner gave an offer', async () => {
    const offer = contentReply({ posterSpecification: { ...contentReply().posterSpecification, template: 'boutique_special_offer_01' } });
    const a = build();
    a.provider.queue('content', offer);
    expect((await a.service.generate(input())).posterSpecification.template).toBe('boutique_new_arrival_01');
    const b = build();
    b.provider.queue('content', offer);
    const stated = await b.service.generate(input({ transcript: 'Sale, 20 percent off', entities: entities({ discount: '20% off' }) }));
    expect(stated.posterSpecification.template).toBe('boutique_special_offer_01');
  });

  it('repairs a reply written in the wrong language', async () => {
    const { provider, service } = build();
    provider.queue('content', english(), contentReply());
    const out = await service.generate(input());
    expect(out.language).toBe('hi');
    expect(provider.callsFor('content')[1].user).toContain('language');
  });

  it('normalises hashtags and rejects a set that is too small', async () => {
    const a = build();
    a.provider.queue('content', contentReply({ hashtags: ['CottonKurtis', '#New Arrivals', '#cottonkurtis', '#Ethnic'] }));
    expect((await a.service.generate(input())).hashtags).toEqual(['#CottonKurtis', '#NewArrivals', '#Ethnic']);
    const b = build();
    b.provider.queue('content', contentReply({ hashtags: ['<<>>'] }), contentReply());
    expect((await b.service.generate(input())).hashtags.length).toBeGreaterThan(0);
  });

  it('recovers from one malformed reply and fails safely after two', async () => {
    const a = build();
    a.provider.queue('content', new AiOutputInvalidError('response could not be parsed'), contentReply());
    await expect(a.service.generate(input())).resolves.toMatchObject({ language: 'hi' });
    const b = build();
    b.provider.queue('content', new AiOutputInvalidError('x'), new AiOutputInvalidError('x'));
    await expect(b.service.generate(input())).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('passes a clarification request through', async () => {
    const { provider, service } = build();
    provider.queue('content', contentReply({ requiresClarification: true, clarificationQuestion: 'किस प्रोडक्ट का पोस्ट बनाना है?' }));
    expect(await service.generate(input())).toMatchObject({ requiresClarification: true, clarificationQuestion: 'किस प्रोडक्ट का पोस्ट बनाना है?' });
  });
});
