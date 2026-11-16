import { BadGatewayException } from '@nestjs/common';
import { BusinessContextService } from './business-context.service';
import type { ClaudeProviderService } from './claude-provider.service';
import { ContentEditingService, type Draft } from './content-editing.service';
import { PromptBuilderService } from './prompt-builder.service';
import { context, editedReply, FakeProvider, planReply } from './test-helpers';

const contextService = new BusinessContextService(null as never, null as never, null as never, null as never);

function build() {
  const provider = new FakeProvider();
  return { provider, service: new ContentEditingService(provider as unknown as ClaudeProviderService, new PromptBuilderService(), contextService) };
}

const draft = (over: Partial<Draft> = {}): Draft => ({
  headline: 'New cotton kurtis are here!',
  caption: 'Discover our cotton kurti collection, now at ₹899. Choose your favourite style.',
  callToAction: 'Visit us today!',
  hashtags: ['#CottonKurtis', '#NewArrivals'],
  language: 'en',
  ...over,
});

const english = (over: Record<string, unknown> = {}) =>
  editedReply({
    language: 'en',
    headline: 'New cotton kurtis are here!',
    caption: 'Cotton kurtis, now at ₹899. Pick your style.',
    callToAction: 'Visit us today!',
    posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'New cotton kurtis', priceText: '₹899', ctaText: 'Visit us today!' },
    ...over,
  });

const edit = (service: ContentEditingService, instruction: string, plan: ReturnType<typeof planReply>, d = draft()) =>
  service.edit({ ctx: context(), draft: d, instruction, plan: plan as never });

describe('ContentEditingService', () => {
  describe('plan (Haiku)', () => {
    it('keeps a new price only when the owner said it in the instruction', async () => {
      const { provider, service } = build();
      provider.queue('edit-plan', planReply({ operations: ['SET_PRICE'], newPrice: '799' }), planReply({ operations: ['SET_PRICE'], newPrice: '799' }));
      expect((await service.plan(draft(), 'Price is now 799 rupees')).newPrice).toBe('799');
      expect((await service.plan(draft(), 'Make the price lower')).newPrice).toBeNull();
    });

    it('understands a mixed-language instruction with several operations', async () => {
      const { provider, service } = build();
      provider.queue('edit-plan', planReply({ operations: ['SHORTEN', 'CHANGE_LANGUAGE', 'REMOVE_PRICE'], targetLanguage: 'mr' }));
      const plan = await service.plan(draft(), 'Make it shorter and use Marathi. Remove the price.');
      expect(plan).toMatchObject({ operations: ['SHORTEN', 'CHANGE_LANGUAGE', 'REMOVE_PRICE'], targetLanguage: 'mr' });
      expect(provider.callsFor('edit-plan')[0].user).toContain('<instruction>\nMake it shorter and use Marathi. Remove the price.\n</instruction>');
    });
  });

  describe('edit (Sonnet)', () => {
    it('applies a change while keeping the confirmed price and the other fields', async () => {
      const { provider, service } = build();
      provider.queue('edit', english());
      const out = await edit(service, 'Make the caption shorter', planReply());
      expect(out.price).toBe('899');
      expect(out.headline).toBe('New cotton kurtis are here!');
      expect(out.posterSpecification.priceText).toBe('₹899');
      expect(out.changesApplied).toEqual(['Shortened the caption']);
      // The draft, the facts and the instruction all reach the model.
      const sent = provider.callsFor('edit')[0];
      expect(sent.user).toContain('"priceToUse": "899"');
      expect(sent.user).toContain('New cotton kurtis are here!');
      expect(provider.callsFor('edit')).toHaveLength(1);
    });

    it('removes the price everywhere when asked', async () => {
      const { provider, service } = build();
      const clean = english({ caption: 'Cotton kurtis. Pick your style.', posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'New cotton kurtis', priceText: null, ctaText: 'Visit us today!' } });
      provider.queue('edit', clean);
      const out = await edit(service, 'Remove the price', planReply({ operations: ['REMOVE_PRICE'] }));
      expect(out.price).toBeNull();
      expect(out.productUnderstanding.price).toBeNull();
      expect(out.posterSpecification.priceText).toBeNull();
      expect(out.caption).not.toContain('899');
    });

    it('rejects a reply that still shows the price, then repairs it', async () => {
      const { provider, service } = build();
      const stillThere = english({ caption: 'Cotton kurtis, now at ₹899.' });
      const clean = english({ caption: 'Cotton kurtis. Pick your style.', posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'New cotton kurtis', priceText: null, ctaText: 'Visit us today!' } });
      provider.queue('edit', stillThere, clean);
      const out = await edit(service, 'Remove the price', planReply({ operations: ['REMOVE_PRICE'] }));
      expect(out.caption).not.toContain('899');
      expect(provider.callsFor('edit')[1].user).toContain('must be removed');
    });

    it('also catches the price left in the poster text', async () => {
      const { provider, service } = build();
      const posterStill = english({ caption: 'Cotton kurtis. Pick your style.', posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'Only ₹899', priceText: null, ctaText: 'Visit us today!' } });
      provider.queue('edit', posterStill, posterStill);
      await expect(edit(service, 'Remove the price', planReply({ operations: ['REMOVE_PRICE'] }))).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('translates to the requested language and keeps product and price', async () => {
      const { provider, service } = build();
      const marathi = editedReply({
        language: 'mr',
        headline: 'नवीन कॉटन कुर्ती आल्या आहेत!',
        caption: 'आमचे कॉटन कुर्ती कलेक्शन आता ₹899 मध्ये. तुमची आवडती स्टाइल निवडा.',
        callToAction: 'आजच भेट द्या!',
        posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'नवीन कलेक्शन', priceText: '₹899', ctaText: 'आजच भेट द्या!' },
        changesApplied: ['Translated to Marathi'],
      });
      provider.queue('edit', marathi);
      const out = await edit(service, 'Use Marathi', planReply({ operations: ['CHANGE_LANGUAGE'], targetLanguage: 'mr' }));
      expect(out.language).toBe('mr');
      expect(out.caption).toContain('₹899');
      expect(provider.callsFor('edit')[0].user).toContain('Output language: mr');
    });

    it('repairs a reply that ignored the language change', async () => {
      const { provider, service } = build();
      const marathi = editedReply({
        language: 'mr',
        headline: 'नवीन कॉटन कुर्ती!',
        caption: 'आमचे कलेक्शन आता ₹899 मध्ये.',
        callToAction: 'आजच भेट द्या!',
        posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'नवीन', priceText: '₹899', ctaText: 'आजच भेट द्या!' },
      });
      provider.queue('edit', english(), marathi);
      const out = await edit(service, 'Use Marathi', planReply({ operations: ['CHANGE_LANGUAGE'], targetLanguage: 'mr' }));
      expect(out.language).toBe('mr');
      expect(provider.callsFor('edit')).toHaveLength(2);
    });

    it('sets a new price only when the owner gave one in the instruction', async () => {
      const { provider, service } = build();
      provider.queue('edit', english({ caption: 'Cotton kurtis, now at ₹799.', posterSpecification: { template: 'boutique_new_arrival_01', theme: 'elegant', layout: 'product_center', headline: 'x', priceText: '₹799', ctaText: 'Visit us today!' } }));
      const out = await service.edit({ ctx: context(), draft: draft(), instruction: 'Price is 799 rupees now', plan: planReply({ operations: ['SET_PRICE'], newPrice: '799' }) as never });
      expect(out.price).toBe('799');
      expect(out.posterSpecification.priceText).toBe('₹799');
    });

    it('rejects an invented number during an edit', async () => {
      const { provider, service } = build();
      const invented = english({ caption: 'Cotton kurtis, 25% off today!' });
      provider.queue('edit', invented, invented);
      await expect(edit(service, 'Make it more attractive', planReply({ operations: ['MORE_ATTRACTIVE'] }))).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('uses the product record price when the draft text does not show one', () => {
      const { service } = build();
      const product = { id: 'p', name: 'Kurti', description: null, category: null, price: '1299', isAvailable: true, imageUrl: null };
      expect(service.currentPrice(draft({ caption: 'A lovely kurti' }), context({ product }))).toBe('1299');
      expect(service.currentPrice(draft({ caption: 'A lovely kurti' }), context())).toBeNull();
    });
  });
});
