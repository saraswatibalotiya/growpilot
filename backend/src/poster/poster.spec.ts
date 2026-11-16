import { createHash } from 'node:crypto';
import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { FakeProvider } from '../ai/test-helpers';
import {
  acceptModelDesign,
  acceptOwnerDesign,
  applyPatch,
  contrastRatio,
  ensureReadable,
  formatPrice,
  InvalidDesignError,
  TEMPLATES,
  templateDesign,
  type ModelDesign,
  type ModelPatch,
  type PosterDesign,
  type Template,
  type VerifiedFacts,
} from './poster-design';
import { PosterDesignService } from './poster-design.service';
import { CANVAS, computeLayout, fitText, overlaps, type Rect } from './poster-layout';
import { PosterRenderError, renderPoster } from './poster-renderer';
import { PosterService } from './poster.service';

const NO_FACTS: VerifiedFacts = { price: null, priceSource: null, currency: 'INR', offer: null };
const PRICE_FACTS: VerifiedFacts = { price: '699', priceSource: 'product', currency: 'INR', offer: null };
const OFFER_FACTS: VerifiedFacts = { price: '699', priceSource: 'owner', currency: 'INR', offer: '20% OFF this week' };
const TEXT = { headline: 'New Sandals, Bold Steps', callToAction: 'DM now' };

const modelDesign = (over: Partial<ModelDesign> = {}): ModelDesign => ({
  template: 'minimal_studio',
  backgroundStyle: 'solid',
  backgroundColor: '#F6EFE3',
  backgroundGradient: null,
  photoTreatment: 'natural',
  productAlignment: 'center',
  headline: TEXT.headline,
  headlinePosition: 'top',
  showPrice: true,
  pricePosition: 'bottom-right',
  callToAction: TEXT.callToAction,
  textColor: '#3A2F25',
  accentColor: '#8C6F55',
  reasoning: 'Warm neutral to match the sandals.',
  ...over,
});

/** A photo with a clearly coloured product on a plain light backdrop, at any size. */
async function photo(width: number, height: number, format: 'jpeg' | 'png' = 'jpeg'): Promise<Buffer> {
  const product = await sharp({ create: { width: Math.round(width * 0.5), height: Math.round(height * 0.5), channels: 3, background: '#B4532A' } }).png().toBuffer();
  const img = sharp({ create: { width, height, channels: 3, background: '#E8ECEF' } }).composite([{ input: product, gravity: 'centre' }]);
  return format === 'jpeg' ? img.jpeg({ quality: 95 }).toBuffer() : img.png().toBuffer();
}

/** Mean RGB of a region, read from raw pixels. (sharp's stats() ignores extract(), so it must not be used for regions.) */
async function meanRgb(buf: Buffer, left: number, top: number, width: number, height: number): Promise<number[]> {
  const { data, info } = await sharp(buf).extract({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c] = sum[c]! + data[i + c]!;
  const n = data.length / info.channels;
  return sum.map((v) => v / n);
}

const rects = (l: ReturnType<typeof computeLayout>): Rect[] => [l.headline, l.offer, l.cta, l.badge].filter((r): r is Rect => r !== null);

describe('price and offer rules', () => {
  it('formats a verified price with the currency symbol and Indian grouping', () => {
    expect(formatPrice('699')).toBe('₹699');
    expect(formatPrice('1299')).toBe('₹1,299');
    expect(formatPrice('125000')).toBe('₹1,25,000');
    expect(formatPrice('899.00')).toBe('₹899');
    expect(formatPrice('८९९')).toBe('₹899');
  });

  it('has no price text when there is no usable price', () => {
    for (const bad of [null, '', 'free', '0', 'abc']) expect(formatPrice(bad)).toBeNull();
  });

  it('never shows a price badge when no price was verified, whatever the AI asked for', () => {
    const { design, notes } = acceptModelDesign(modelDesign({ showPrice: true }), { text: TEXT, facts: NO_FACTS, category: 'footwear', shopName: 'Sukoon Sole' });
    expect(design.showPrice).toBe(false);
    expect(notes.join(' ')).toMatch(/no verified price/i);
  });

  it('keeps the price flag when a price is verified', () => {
    expect(acceptModelDesign(modelDesign(), { text: TEXT, facts: PRICE_FACTS, category: null, shopName: 'S' }).design.showPrice).toBe(true);
  });

  it('refuses a made-up price in the AI text: any number the owner did not give is replaced by their own text', () => {
    const { design, notes } = acceptModelDesign(modelDesign({ headline: 'Sandals only ₹499', callToAction: 'Buy 2 get 1' }), { text: TEXT, facts: PRICE_FACTS, category: null, shopName: 'S' });
    expect(design.headline).toBe(TEXT.headline);
    expect(design.callToAction).toBe(TEXT.callToAction);
    expect(notes.join(' ')).toMatch(/numbers/i);
  });

  it('allows numbers that come from the owner: their text, their price, their offer', () => {
    const facts = { ...OFFER_FACTS };
    const out = acceptModelDesign(modelDesign({ template: 'offer_poster', headline: 'Now ₹699', callToAction: '20 percent' }), { text: { headline: 'Festive', callToAction: 'Hurry' }, facts, category: null, shopName: 'S' });
    expect(out.design.headline).toBe('Now ₹699');
  });

  it('does not use the Offer Poster without an offer the owner typed', () => {
    const { design, notes } = acceptModelDesign(modelDesign({ template: 'offer_poster' }), { text: TEXT, facts: PRICE_FACTS, category: 'footwear', shopName: 'S' });
    expect(design.template).not.toBe('offer_poster');
    expect(notes.join(' ')).toMatch(/offer/i);
    expect(() => acceptOwnerDesign({ ...templateDesign('minimal_studio', TEXT, true), template: 'offer_poster' }, PRICE_FACTS)).toThrow(InvalidDesignError);
  });

  it('allows the Offer Poster when the owner supplied an offer', () => {
    expect(acceptOwnerDesign(templateDesign('offer_poster', TEXT, true), OFFER_FACTS).design.template).toBe('offer_poster');
  });
});

describe('design validation', () => {
  const ctx = { text: TEXT, facts: PRICE_FACTS, category: null, shopName: 'S' };

  it('rejects colours that are not hex, so a made-up colour name never reaches the renderer', () => {
    expect(() => acceptModelDesign(modelDesign({ backgroundColor: 'warm beige' }), ctx)).toThrow(InvalidDesignError);
    expect(() => acceptModelDesign(modelDesign({ accentColor: 'rgb(1,2,3)' }), ctx)).toThrow(InvalidDesignError);
  });

  it('accepts short hex colours and normalises them', () => {
    expect(acceptModelDesign(modelDesign({ backgroundColor: '#fe8' }), ctx).design.backgroundColor).toBe('#FFEE88');
  });

  it('repairs unreadable text colour instead of shipping it', () => {
    const { design } = acceptModelDesign(modelDesign({ backgroundColor: '#F6EFE3', textColor: '#F8F0E5' }), ctx);
    expect(contrastRatio(design.backgroundColor, design.textColor)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps readable text colour on a dark background too', () => {
    const d = ensureReadable({ ...templateDesign('minimal_studio', TEXT, false), backgroundColor: '#1B1B1B', textColor: '#222222' });
    expect(contrastRatio('#1B1B1B', d.textColor)).toBeGreaterThanOrEqual(4.5);
  });

  it('rejects unknown template names, positions and treatments (strict lists)', () => {
    expect(() => acceptOwnerDesign({ ...templateDesign('minimal_studio', TEXT, false), template: 'neon_party' }, NO_FACTS)).toThrow(InvalidDesignError);
    expect(() => acceptOwnerDesign({ ...templateDesign('minimal_studio', TEXT, true), pricePosition: 'top-left' }, PRICE_FACTS)).toThrow(InvalidDesignError);
    expect(() => acceptOwnerDesign({ ...templateDesign('minimal_studio', TEXT, false), photoTreatment: 'cartoon' }, NO_FACTS)).toThrow(InvalidDesignError);
  });

  it('requires gradient colours for a gradient background', () => {
    expect(() => acceptOwnerDesign({ ...templateDesign('minimal_studio', TEXT, false), backgroundStyle: 'gradient', backgroundGradient: null }, NO_FACTS)).toThrow(InvalidDesignError);
  });

  it('applies a Haiku patch: only the changed fields move, and a new template brings its own palette', () => {
    const base = templateDesign('minimal_studio', TEXT, true);
    const patch: ModelPatch = { template: 'premium_editorial', backgroundStyle: null, backgroundColor: null, backgroundGradient: null, photoTreatment: null, productAlignment: null, showHeadline: null, headlinePosition: null, showPrice: false, pricePosition: null, textColor: null, accentColor: null, requiresClarification: false, clarificationQuestion: null, changesApplied: ['x'] };
    const { design } = applyPatch(base, patch, PRICE_FACTS);
    expect(design.template).toBe('premium_editorial');
    expect(design.showPrice).toBe(false);
    expect(design.backgroundStyle).toBe('gradient');
    expect(design.headline).toBe(base.headline);
  });

  it('a patch cannot turn on the Offer Poster without an offer', () => {
    const base = templateDesign('minimal_studio', TEXT, true);
    const patch: ModelPatch = { template: 'offer_poster', backgroundStyle: null, backgroundColor: null, backgroundGradient: null, photoTreatment: null, productAlignment: null, showHeadline: null, headlinePosition: null, showPrice: null, pricePosition: null, textColor: null, accentColor: null, requiresClarification: false, clarificationQuestion: null, changesApplied: [] };
    const { design, notes } = applyPatch(base, patch, PRICE_FACTS);
    expect(design.template).toBe('minimal_studio');
    expect(notes.join(' ')).toMatch(/offer/i);
  });
});

describe('layout: the product is never covered', () => {
  const variants: Array<[string, Partial<PosterDesign>]> = [
    ['default', {}],
    ['badge left', { pricePosition: 'bottom-left' }],
    ['headline at the bottom', { headlinePosition: 'bottom' }],
    ['headline hidden', { showHeadline: false }],
    ['aligned left', { productAlignment: 'left' }],
    ['aligned right', { productAlignment: 'right' }],
    ['long text', { headline: 'A very long headline about handcrafted comfortable sandals for every single step', callToAction: 'DM Now' }],
  ];

  for (const template of TEMPLATES) {
    for (const [name, over] of variants) {
      it(`${template} / ${name}: text, offer ribbon and badge stay outside the photo frame and inside the canvas`, () => {
        const design = { ...templateDesign(template, TEXT, true), ...over };
        const layout = computeLayout(design, { priceText: '₹1,299', offerText: template === 'offer_poster' ? '20% OFF this week' : null });
        for (const r of rects(layout)) {
          expect(overlaps(r, layout.photo)).toBe(false);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.width).toBeLessThanOrEqual(CANVAS.width);
          expect(r.y + r.height).toBeLessThanOrEqual(CANVAS.height);
        }
        expect(layout.photo.height).toBeGreaterThan(500);
        expect(layout.photo.x + layout.photo.width).toBeLessThanOrEqual(CANVAS.width);
      });
    }
  }

  it('keeps text, the offer ribbon and the badge at least 40 px from every edge, in every template', () => {
    for (const template of TEMPLATES) {
      for (const pricePosition of ['bottom-left', 'bottom-right'] as const) {
        const layout = computeLayout({ ...templateDesign(template, TEXT, true), pricePosition }, { priceText: '₹1,299', offerText: template === 'offer_poster' ? '20% OFF this week' : null });
        for (const r of rects(layout)) {
          expect(r.x).toBeGreaterThanOrEqual(40);
          expect(r.x + r.width).toBeLessThanOrEqual(CANVAS.width - 40);
          expect(r.y + r.height).toBeLessThanOrEqual(CANVAS.height - 40);
        }
      }
    }
  });

  it('puts the badge in the requested corner and keeps the call to action off it', () => {
    const right = computeLayout({ ...templateDesign('minimal_studio', TEXT, true), pricePosition: 'bottom-right' }, { priceText: '₹699', offerText: null });
    const left = computeLayout({ ...templateDesign('minimal_studio', TEXT, true), pricePosition: 'bottom-left' }, { priceText: '₹699', offerText: null });
    expect(right.badge!.x).toBeGreaterThan(CANVAS.width / 2);
    expect(left.badge!.x).toBeLessThan(CANVAS.width / 2);
    expect(overlaps(right.badge!, right.cta!)).toBe(false);
    expect(overlaps(left.badge!, left.cta!)).toBe(false);
  });

  it('has no badge without a price, even if the design asks for one', () => {
    expect(computeLayout(templateDesign('minimal_studio', TEXT, true), { priceText: null, offerText: null }).badge).toBeNull();
  });

  it('keeps wrapped text inside its box, shrinking before it overflows', () => {
    const fit = fitText('A very long headline about handcrafted comfortable sandals for every single step', { width: 900, height: 140 }, { maxFont: 70, minFont: 30, maxLines: 2, bold: true });
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.fontSize).toBeGreaterThanOrEqual(30);
  });
});

describe('rendering', () => {
  const render = (buf: Buffer, over: Partial<PosterDesign> = {}, price: string | null = '₹699', template: Template = 'minimal_studio') =>
    renderPoster({ photo: buf, design: { ...templateDesign(template, TEXT, !!price), ...over }, priceText: price, offerText: template === 'offer_poster' ? 'Festive offer' : null });

  it('always produces a 1080x1350 JPEG, for any photo size or shape', async () => {
    for (const [w, h] of [[800, 800], [1200, 600], [600, 1400], [3000, 2000], [64, 80], [4000, 400]] as const) {
      const out = await render(await photo(w, h));
      const info = await sharp(out.buffer).metadata();
      expect([info.format, info.width, info.height]).toEqual(['jpeg', 1080, 1350]);
      expect(out.buffer.length).toBeLessThan(8 * 1024 * 1024);
    }
  });

  it('accepts PNG photos too', async () => {
    const info = await sharp((await render(await photo(900, 1100, 'png'))).buffer).metadata();
    expect([info.width, info.height]).toEqual([1080, 1350]);
  });

  it('draws every template', async () => {
    for (const t of TEMPLATES) {
      const out = await render(await photo(900, 1100), {}, '₹699', t);
      expect(out.buffer.length).toBeGreaterThan(10_000);
    }
  });

  it('fits the whole photo inside the frame without cropping or stretching it', async () => {
    for (const [w, h] of [[800, 800], [600, 1400], [1400, 600]] as const) {
      const out = await render(await photo(w, h));
      expect(out.photoRect.width / out.photoRect.height).toBeCloseTo(w / h, 1);
      expect(out.photoRect.x).toBeGreaterThanOrEqual(out.layout.photo.x);
      expect(out.photoRect.x + out.photoRect.width).toBeLessThanOrEqual(out.layout.photo.x + out.layout.photo.width);
      expect(out.photoRect.y + out.photoRect.height).toBeLessThanOrEqual(out.layout.photo.y + out.layout.photo.height);
    }
  });

  it('applies the background style: solid and gradient look different, and the solid colour is exact', async () => {
    const src = await photo(900, 1100);
    const solid = await render(src, { backgroundStyle: 'solid', backgroundColor: '#F6EFE3', backgroundGradient: null });
    const grad = await render(src, { backgroundStyle: 'gradient', backgroundGradient: { from: '#FFFFFF', to: '#222222', direction: 'vertical' } });
    const corner = (b: Buffer, x: number, y: number) => meanRgb(b, x, y, 4, 4);
    const topSolid = await corner(solid.buffer, 6, 6);
    expect(Math.abs(topSolid[0]! - 0xf6)).toBeLessThanOrEqual(3);
    expect(Math.abs(topSolid[1]! - 0xef)).toBeLessThanOrEqual(3);
    expect(Math.abs(topSolid[2]! - 0xe3)).toBeLessThanOrEqual(3);
    const topGrad = await corner(grad.buffer, 6, 6);
    const bottomGrad = await corner(grad.buffer, 6, 1340);
    expect(topGrad[0]! - bottomGrad[0]!).toBeGreaterThan(120);
  });

  it('draws the price badge in the chosen corner, and none when there is no price', async () => {
    const src = await photo(900, 1100);
    const accent = '#C2410C';
    const accentPixels = async (design: Partial<PosterDesign>, price: string | null) => {
      const out = await render(src, { accentColor: accent, backgroundColor: '#FFFFFF', backgroundGradient: null, backgroundStyle: 'solid', ...design }, price);
      const half = async (left: number) => {
        const { data } = await sharp(out.buffer).extract({ left, top: 1130, width: 540, height: 200 }).raw().toBuffer({ resolveWithObject: true });
        let n = 0;
        for (let i = 0; i < data.length; i += 3) if (Math.abs(data[i]! - 0xc2) < 14 && Math.abs(data[i + 1]! - 0x41) < 14 && Math.abs(data[i + 2]! - 0x0c) < 14) n++;
        return n;
      };
      return { left: await half(0), right: await half(540) };
    };
    const right = await accentPixels({ pricePosition: 'bottom-right' }, '₹699');
    const left = await accentPixels({ pricePosition: 'bottom-left' }, '₹699');
    const none = await accentPixels({ pricePosition: 'bottom-right' }, null);
    expect(right.right).toBeGreaterThan(2000);
    expect(right.left).toBeLessThan(200);
    expect(left.left).toBeGreaterThan(2000);
    expect(left.right).toBeLessThan(200);
    expect(none.left + none.right).toBeLessThan(200);
  });

  it('preserves the product: with the natural treatment the photo area matches the original pixels', async () => {
    const src = await photo(900, 1100);
    const out = await render(src, { photoTreatment: 'natural' });
    const r = out.photoRect;
    // Compare the middle of the photo area (away from the rounded corners) with the original scaled the same way.
    const inset = 40;
    const region = { left: r.x + inset, top: r.y + inset, width: r.width - 2 * inset, height: r.height - 2 * inset };
    const posterPart = await sharp(out.buffer).extract(region).raw().toBuffer();
    const expected = await sharp(src)
      .resize(r.width, r.height, { fit: 'fill' })
      .extract({ left: inset, top: inset, width: region.width, height: region.height })
      .raw()
      .toBuffer();
    let diff = 0;
    for (let i = 0; i < posterPart.length; i++) diff += Math.abs(posterPart[i]! - expected[i]!);
    expect(diff / posterPart.length).toBeLessThan(2.5); // only JPEG rounding
  });

  it('keeps the product colour under every treatment: tone shifts stay small', async () => {
    const src = await photo(900, 1100);
    const meanColour = async (treatment: PosterDesign['photoTreatment']) => {
      const out = await render(src, { photoTreatment: treatment });
      const r = out.photoRect;
      return meanRgb(out.buffer, r.x + r.width / 2 - 20, r.y + r.height / 2 - 20, 40, 40);
    };
    const natural = await meanColour('natural');
    for (const t of ['brighter', 'vivid', 'soft'] as const) {
      const shifted = await meanColour(t);
      shifted.forEach((v, i) => expect(Math.abs(v - natural[i]!)).toBeLessThan(26));
    }
  });

  it('does not modify the photo buffer it was given', async () => {
    const src = await photo(900, 1100);
    const before = createHash('sha256').update(src).digest('hex');
    await render(src, { photoTreatment: 'vivid' });
    expect(createHash('sha256').update(src).digest('hex')).toBe(before);
  });

  it('reports an unreadable photo as a PosterRenderError, not a crash', async () => {
    await expect(render(Buffer.from('this is not an image'))).rejects.toBeInstanceOf(PosterRenderError);
    await expect(render(Buffer.alloc(0))).rejects.toBeInstanceOf(PosterRenderError);
  });

  it('renders Hindi and Marathi text', async () => {
    const out = await renderPoster({
      photo: await photo(900, 1100),
      design: { ...templateDesign('minimal_studio', { headline: 'नए सैंडल्स, हर कदम पर स्टाइल', callToAction: 'आज ही आइए' }, true) },
      priceText: '₹699',
      offerText: null,
    });
    expect(out.buffer.length).toBeGreaterThan(10_000);
  });
});

describe('PosterDesignService (Claude responses are validated)', () => {
  const prompt = { shopName: 'Sukoon Sole', category: 'footwear', headline: TEXT.headline, callToAction: TEXT.callToAction, language: 'en', offerProvided: false, priceAvailable: true };
  const input = { imageUrl: 'https://res.cloudinary.com/demo/image/upload/x.jpg', prompt, facts: PRICE_FACTS, text: TEXT };
  const build = () => {
    const provider = new FakeProvider();
    return { provider, service: new PosterDesignService(provider as never) };
  };

  it('uses a valid design from Sonnet, and tells Sonnet whether a price exists without giving it the price', async () => {
    const { provider, service } = build();
    provider.queue('poster-design', modelDesign({ template: 'product_spotlight' }));
    const out = await service.design(input);
    expect(out.source).toBe('ai');
    expect(out.design.template).toBe('cover_card');
    const sent = provider.callsFor('poster-design')[0]!;
    expect(sent.user).toContain('price_available: true');
    expect(sent.user).not.toContain('699');
    expect(sent.images).toEqual([{ type: 'url', url: input.imageUrl }]);
  });

  it('asks once more when the first answer is invalid, saying exactly what was wrong', async () => {
    const { provider, service } = build();
    provider.queue('poster-design', modelDesign({ backgroundColor: 'beige' }), modelDesign());
    const out = await service.design(input);
    expect(out.source).toBe('ai');
    expect(provider.callsFor('poster-design')).toHaveLength(2);
    expect(provider.callsFor('poster-design')[1]!.user).toMatch(/rejected.*backgroundColor/s);
  });

  it('falls back to the template palette (and says so) after two unusable answers', async () => {
    const { provider, service } = build();
    provider.queue('poster-design', modelDesign({ accentColor: 'nope' }), modelDesign({ accentColor: 'still nope' }));
    const out = await service.design(input);
    expect(out.source).toBe('template');
    expect(out.notes.join(' ')).toMatch(/not usable/i);
    expect(out.design.template).toBe('cover_card'); // house default
    expect(provider.callsFor('poster-design')).toHaveLength(2);
  });

  it('does not hide a Claude outage behind a template: the error reaches the owner', async () => {
    const { provider, service } = build();
    provider.queue('poster-design', new ServiceUnavailableException('The AI service is not configured correctly'));
    await expect(service.design(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('never accepts a template change that needs an offer the owner did not give', async () => {
    const { provider, service } = build();
    provider.queue('poster-design', modelDesign({ template: 'offer_poster' }));
    const out = await service.design(input);
    expect(out.design.template).not.toBe('offer_poster');
  });

  it('understands "make it look premium" as a patch from Haiku, and applies it', async () => {
    const { provider, service } = build();
    provider.queue('poster-edit', { template: 'premium_editorial', backgroundStyle: null, backgroundColor: null, backgroundGradient: null, photoTreatment: null, productAlignment: null, showHeadline: null, headlinePosition: null, showPrice: null, pricePosition: null, textColor: null, accentColor: null, requiresClarification: false, clarificationQuestion: null, changesApplied: ['Switched to the Premium Editorial layout'] });
    const out = await service.edit({ design: templateDesign('minimal_studio', TEXT, true), instruction: 'Make it look premium', facts: PRICE_FACTS });
    expect('design' in out && out.design.template).toBe('premium_editorial');
    expect(provider.callsFor('poster-edit')).toHaveLength(1);
  });

  it('hides the price and the headline from instructions', async () => {
    const { provider, service } = build();
    const nulls = { template: null, backgroundStyle: null, backgroundColor: null, backgroundGradient: null, photoTreatment: null, productAlignment: null, headlinePosition: null, pricePosition: null, textColor: null, accentColor: null, requiresClarification: false, clarificationQuestion: null, changesApplied: ['Hid the price and headline'] };
    provider.queue('poster-edit', { ...nulls, showPrice: false, showHeadline: false });
    const out = await service.edit({ design: templateDesign('minimal_studio', TEXT, true), instruction: 'Hide the price and remove the headline', facts: PRICE_FACTS });
    expect('design' in out && [out.design.showPrice, out.design.showHeadline]).toEqual([false, false]);
  });

  it('asks the owner a question when the instruction is unclear, and changes nothing', async () => {
    const { provider, service } = build();
    provider.queue('poster-edit', { template: null, backgroundStyle: null, backgroundColor: null, backgroundGradient: null, photoTreatment: null, productAlignment: null, showHeadline: null, headlinePosition: null, showPrice: null, pricePosition: null, textColor: null, accentColor: null, requiresClarification: true, clarificationQuestion: 'Which colour would you like?', changesApplied: [] });
    const out = await service.edit({ design: templateDesign('minimal_studio', TEXT, true), instruction: 'make it nicer', facts: PRICE_FACTS });
    expect(out).toMatchObject({ clarification: 'Which colour would you like?' });
  });

  it('does not let an instruction put text or a price on the poster: the patch has no text fields', async () => {
    const { provider, service } = build();
    const nulls = { template: null, backgroundStyle: null, backgroundColor: null, backgroundGradient: null, photoTreatment: null, productAlignment: null, showHeadline: null, headlinePosition: null, showPrice: null, pricePosition: null, textColor: null, accentColor: null, requiresClarification: false, clarificationQuestion: null, changesApplied: [] };
    provider.queue('poster-edit', { ...nulls, headline: 'Only ₹1', price: '1' });
    const before = templateDesign('minimal_studio', TEXT, true);
    const out = await service.edit({ design: before, instruction: 'write only 1 rupee', facts: PRICE_FACTS });
    expect('design' in out && out.design.headline).toBe(before.headline);
  });
});

describe('PosterService (ownership, price, storage)', () => {
  const ASSET = { id: 'asset-1', businessId: 'biz-1', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/a.jpg', variant: 'original', sourceAssetId: null, sha256: 'sha-a', width: 900, height: 1100, bytes: 5000, createdAt: new Date() };

  const ENHANCED = { ...ASSET, id: 'enh-1', variant: 'ai_edited', sourceAssetId: 'asset-1', sha256: 'sha-enhanced', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/studio/enhanced.jpg' };

  async function build(opts: { ai?: boolean; aiError?: Error; aiCached?: boolean; photoBuffer?: Buffer; product?: Record<string, unknown> | null; ownsAsset?: boolean; existing?: Record<string, unknown> | null; postStatus?: string } = {}) {
    const photoBuffer = opts.photoBuffer ?? (await photo(900, 1100));
    const created: Array<Record<string, unknown>> = [];
    const uploads: unknown[][] = [];
    const media = {
      findBySecureUrl: jest.fn(async (url: string) => (url === ASSET.secureUrl ? { id: ASSET.id } : null)),
      findVariant: jest.fn(async () => opts.existing ?? null),
      create: jest.fn(async (id: string, data: Record<string, unknown>) => {
        created.push(data);
        return { id, createdAt: new Date(), ...data };
      }),
    };
    const businesses = { findPrimaryForUser: jest.fn(async () => ({ id: 'biz-1', name: 'Sukoon Sole', category: 'footwear' })) };
    const products = { findById: jest.fn(async () => (opts.product === undefined ? null : opts.product)) };
    const posts = {
      get: jest.fn(async () => ({ id: 'post-1', headline: 'Post headline', callToAction: 'Post CTA', productId: opts.product ? 'prod-1' : null })),
      update: jest.fn(async () => ({ id: 'post-1', status: opts.postStatus ?? 'PREVIEW_READY' })),
    };
    const studio = {
      owned: jest.fn(async (_userId: string, id?: string) => {
        if (opts.ownsAsset === false) throw new NotFoundException('Media not found');
        return id === ENHANCED.id ? ENHANCED : ASSET;
      }),
      source: jest.fn(async (a: typeof ASSET) => a),
      download: jest.fn(async () => photoBuffer),
      aiEditingAvailable: jest.fn(() => !!opts.ai),
      aiEdit: jest.fn(async () => {
        if (opts.aiError) throw opts.aiError;
        return { result: { id: ENHANCED.id }, warnings: [] as string[], usage: { cached: !!opts.aiCached, claude: null, sharpMs: 0, externalEditorUsd: 0.02 } };
      }),
    };
    const images = { validate: jest.fn(async (_b: string, url: string) => url) };
    const provider = new FakeProvider();
    const designer = new PosterDesignService(provider as never);
    const cloudinary = { upload: jest.fn(async (...args: unknown[]) => (uploads.push(args), { publicId: 'p', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/growpilot/biz-1/posters/poster.jpg', width: 1080, height: 1350, bytes: 99_000 })) };
    const service = new PosterService(media as never, businesses as never, products as never, posts as never, studio as never, images as never, designer, cloudinary as never);
    return { service, provider, media, products, posts, studio, images, cloudinary, created, uploads, photoBuffer };
  }

  const base = { mediaId: '11111111-1111-4111-8111-111111111111' };

  describe('Gemini photo enhancement', () => {
    it('draws the poster from the enhanced copy, keeps the original untouched, and tells Claude to look at what is drawn', async () => {
      const t = await build({ ai: true });
      t.provider.queue('poster-design', modelDesign());
      const out = await t.service.generate('u1', base);
      expect(t.studio.aiEdit).toHaveBeenCalledWith('u1', { mediaId: 'asset-1', format: 'portrait', style: 'enhance' });
      expect(out.enhancement).toMatchObject({ used: true, cached: false, costUsd: 0.02 });
      expect(out.original.id).toBe('asset-1');
      expect(t.images.validate).toHaveBeenCalledWith('biz-1', ENHANCED.secureUrl);
      expect(t.studio.download).toHaveBeenCalledWith(ENHANCED.secureUrl);
      expect(t.created).toHaveLength(1);
      expect(t.created[0]).toMatchObject({ variant: 'poster', sourceAssetId: 'asset-1' });
      expect(t.created[0]!['processingJson']).toMatchObject({ photoAssetId: 'enh-1' });
      expect(t.uploads).toHaveLength(1); // only the poster is uploaded here; the enhanced copy was stored by the studio
    });

    it('reports a repeat as cached, because the same photo is only ever enhanced once', async () => {
      const t = await build({ ai: true, aiCached: true });
      const out = await t.service.render('u1', { ...base, design: templateDesign('minimal_studio', TEXT, false) });
      expect(out.enhancement).toMatchObject({ used: true, cached: true });
    });

    it('does nothing when Gemini is not set up, and says nothing about it', async () => {
      const t = await build();
      t.provider.queue('poster-design', modelDesign());
      const out = await t.service.generate('u1', base);
      expect(t.studio.aiEdit).not.toHaveBeenCalled();
      expect(out.enhancement.used).toBe(false);
      expect(out.notes.join(' ')).not.toMatch(/enhance/i);
      expect(t.images.validate).toHaveBeenCalledWith('biz-1', ASSET.secureUrl);
    });

    it('is skipped when the owner turns it off', async () => {
      const t = await build({ ai: true });
      t.provider.queue('poster-design', modelDesign());
      const out = await t.service.generate('u1', { ...base, enhance: false });
      expect(t.studio.aiEdit).not.toHaveBeenCalled();
      expect(out.enhancement.used).toBe(false);
    });

    it('does not enhance a photo that was already AI-edited', async () => {
      const t = await build({ ai: true });
      t.studio.owned.mockResolvedValueOnce({ ...ASSET, variant: 'ai_edited' } as never);
      t.provider.queue('poster-design', modelDesign());
      await t.service.generate('u1', base);
      expect(t.studio.aiEdit).not.toHaveBeenCalled();
    });

    it('still makes the poster from the original when Gemini fails, and says why', async () => {
      const t = await build({ ai: true, aiError: new HttpException("Today's limit of 10 AI images has been reached.", 429) });
      t.provider.queue('poster-design', modelDesign());
      const out = await t.service.generate('u1', base);
      expect(out.enhancement.used).toBe(false);
      expect(out.notes.join(' ')).toMatch(/couldn't enhance the photo with AI.*limit of 10/);
      expect(t.studio.download).toHaveBeenCalledWith(ASSET.secureUrl);
      expect(t.created).toHaveLength(1);
    });
  });

  it('the Cover Card draws its headline in dark ink: its top fade is light, so white text would vanish', async () => {
    const design = templateDesign('cover_card', TEXT, true);
    expect(contrastRatio('#FFFFFF', design.textColor)).toBeGreaterThan(7); // dark ink against the white fade
    const out = await renderPoster({ photo: await photo(900, 1100), design, priceText: '₹699', offerText: null });
    // The headline sits in the top 14% of the poster. Its letters must differ strongly from the pale fade behind them.
    const { data, info } = await sharp(out.buffer).extract({ left: 40, top: 70, width: 1000, height: 120 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let darkest = 255;
    for (let i = 0; i < data.length; i += info.channels) darkest = Math.min(darkest, 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
    expect(darkest).toBeLessThan(90);
  });

  it('uses the product price for the badge, formatted', async () => {
    const t = await build({ product: { businessId: 'biz-1', price: '1299', currency: 'INR', category: 'footwear' } });
    t.provider.queue('poster-design', modelDesign());
    const out = await t.service.generate('u1', { ...base, productId: '22222222-2222-4222-8222-222222222222' });
    expect(out.price).toEqual({ text: '₹1,299', source: 'product', shown: true });
    expect(out.design.showPrice).toBe(true);
  });

  it('prefers a price the owner typed over the product record', async () => {
    const t = await build({ product: { businessId: 'biz-1', price: '1299', currency: 'INR', category: 'footwear' } });
    t.provider.queue('poster-design', modelDesign());
    const out = await t.service.generate('u1', { ...base, productId: '22222222-2222-4222-8222-222222222222', price: '₹899' });
    expect(out.price).toEqual({ text: '₹899', source: 'owner', shown: true });
  });

  it('shows no badge when there is no verified price, even though Claude wanted one', async () => {
    const t = await build();
    t.provider.queue('poster-design', modelDesign({ showPrice: true }));
    const out = await t.service.generate('u1', base);
    expect(out.price).toBeNull();
    expect(out.design.showPrice).toBe(false);
    expect(t.provider.callsFor('poster-design')[0]!.user).toContain('price_available: false');
  });

  it('still reports the verified price when the badge is hidden, so it can be turned back on', async () => {
    const t = await build({ product: { businessId: 'biz-1', price: '699', currency: 'INR', category: 'footwear' } });
    const hidden = { ...templateDesign('minimal_studio', TEXT, true), showPrice: false };
    const out = await t.service.render('u1', { ...base, productId: '22222222-2222-4222-8222-222222222222', design: hidden });
    expect(out.price).toEqual({ text: '₹699', source: 'product', shown: false });
    const shown = await t.service.render('u1', { ...base, productId: '22222222-2222-4222-8222-222222222222', design: { ...hidden, showPrice: true } });
    expect(shown.price?.shown).toBe(true);
  });

  it('rejects an unreadable price instead of guessing', async () => {
    const t = await build();
    await expect(t.service.generate('u1', { ...base, price: 'cheap' })).rejects.toBeInstanceOf(BadRequestException);
    expect(t.provider.calls).toHaveLength(0);
  });

  it('uses the post headline and call to action unless the owner overrides them', async () => {
    const t = await build();
    t.provider.queue('poster-design', modelDesign({ headline: 'Post headline', callToAction: 'Post CTA' }));
    const out = await t.service.generate('u1', { ...base, postId: '33333333-3333-4333-8333-333333333333' });
    expect(out.design.headline).toBe('Post headline');
    const o = await t.service.render('u1', { ...base, postId: '33333333-3333-4333-8333-333333333333', design: { ...out.design, headline: 'Mine' } });
    expect(o.design.headline).toBe('Mine');
  });

  it('draws the Offer Poster only with an offer the owner typed, and shows that offer word for word', async () => {
    const t = await build({ product: { businessId: 'biz-1', price: '699', currency: 'INR', category: 'footwear' } });
    await expect(t.service.generate('u1', { ...base, template: 'offer_poster' })).rejects.toBeInstanceOf(BadRequestException);
    t.provider.queue('poster-design', modelDesign({ template: 'offer_poster' }));
    const out = await t.service.generate('u1', { ...base, productId: '22222222-2222-4222-8222-222222222222', offer: '20% OFF this week' });
    expect(out.design.template).toBe('offer_poster');
    expect(out.offer).toBe('20% OFF this week');
  });

  it('ordinary posts never get an offer, even if the owner typed one but the template is not the offer poster', async () => {
    const t = await build();
    t.provider.queue('poster-design', modelDesign({ template: 'minimal_studio' }));
    const out = await t.service.generate('u1', { ...base, offer: '50% OFF' });
    expect(out.offer).toBeNull();
  });

  it("refuses a photo that is not the caller's, before any AI or drawing", async () => {
    const t = await build({ ownsAsset: false });
    await expect(t.service.generate('u1', base)).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.render('u1', { ...base, design: templateDesign('minimal_studio', TEXT, false) })).rejects.toBeInstanceOf(NotFoundException);
    expect(t.provider.calls).toHaveLength(0);
    expect(t.cloudinary.upload).not.toHaveBeenCalled();
  });

  it("refuses another shop's product, so its price is never used", async () => {
    const t = await build({ product: { businessId: 'other-biz', price: '10', currency: 'INR', category: null } });
    await expect(t.service.generate('u1', { ...base, productId: '22222222-2222-4222-8222-222222222222' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts the photo by URL, still checking that it is the caller\'s', async () => {
    const t = await build();
    t.provider.queue('poster-design', modelDesign());
    const out = await t.service.generate('u1', { imageUrl: ASSET.secureUrl });
    expect(out.original.id).toBe('asset-1');
    expect(t.studio.owned).toHaveBeenCalledWith('u1', 'asset-1');
    await expect(t.service.generate('u1', { imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/someone-else.jpg' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.generate('u1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to use a finished poster as a photo', async () => {
    const t = await build();
    t.studio.owned.mockResolvedValueOnce({ ...ASSET, variant: 'poster' } as never);
    await expect(t.service.generate('u1', base)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the poster as its own asset linked to the original, and never uploads over the original', async () => {
    const t = await build();
    t.provider.queue('poster-design', modelDesign());
    const out = await t.service.generate('u1', base);
    expect(t.created).toHaveLength(1);
    expect(t.created[0]).toMatchObject({ variant: 'poster', sourceAssetId: 'asset-1', businessId: 'biz-1', mimeType: 'image/jpeg' });
    expect(t.uploads[0]![2]).toBe('growpilot/biz-1/posters');
    expect(out.poster.id).not.toBe('asset-1');
    expect(out.original.id).toBe('asset-1');
    expect(out.usage.cached).toBe(false);
    expect(t.created[0]!['processingJson']).toMatchObject({ kind: 'poster', photoAssetId: 'asset-1' });
  });

  it('returns the stored poster for the same photo and design instead of drawing or uploading again', async () => {
    const t = await build({ existing: { id: 'poster-9', secureUrl: 'https://res.cloudinary.com/demo/image/upload/x.jpg', width: 1080, height: 1350, bytes: 90000, createdAt: new Date() } });
    const out = await t.service.render('u1', { ...base, design: templateDesign('minimal_studio', TEXT, false) });
    expect(out.poster.id).toBe('poster-9');
    expect(out.usage.cached).toBe(true);
    expect(t.cloudinary.upload).not.toHaveBeenCalled();
    expect(t.studio.download).not.toHaveBeenCalled();
  });

  it('render makes no AI call at all', async () => {
    const t = await build();
    await t.service.render('u1', { ...base, design: templateDesign('product_spotlight', TEXT, false) });
    expect(t.provider.calls).toHaveLength(0);
    expect(t.images.validate).not.toHaveBeenCalled();
  });

  it('rejects an invalid design from the client with the exact problems', async () => {
    const t = await build();
    await expect(t.service.render('u1', { ...base, design: { ...templateDesign('minimal_studio', TEXT, false), backgroundColor: 'red' } })).rejects.toMatchObject({ response: { problems: expect.any(Array) } });
  });

  it('turns an image-processing failure into a clear 422 and stores nothing', async () => {
    const t = await build({ photoBuffer: Buffer.from('corrupt') });
    await expect(t.service.render('u1', { ...base, design: templateDesign('minimal_studio', TEXT, false) })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(t.cloudinary.upload).not.toHaveBeenCalled();
    expect(t.created).toHaveLength(0);
  });

  it('edit: applies an instruction and redraws; a question comes back without drawing', async () => {
    const t = await build({ product: { businessId: 'biz-1', price: '699', currency: 'INR', category: 'footwear' } });
    const nulls = { template: null, backgroundStyle: null, backgroundColor: null, backgroundGradient: null, photoTreatment: null, productAlignment: null, showHeadline: null, headlinePosition: null, showPrice: null, pricePosition: 'bottom-left', textColor: null, accentColor: null, requiresClarification: false, clarificationQuestion: null, changesApplied: ['Moved the price to the bottom-left'] };
    t.provider.queue('poster-edit', nulls);
    const design = templateDesign('minimal_studio', TEXT, true);
    const out = await t.service.edit('u1', { ...base, productId: '22222222-2222-4222-8222-222222222222', design, instruction: 'price on the left' });
    expect(out).toMatchObject({ requiresClarification: false, design: { pricePosition: 'bottom-left' }, changesApplied: ['Moved the price to the bottom-left'] });
    t.provider.queue('poster-edit', { ...nulls, pricePosition: null, requiresClarification: true, clarificationQuestion: 'Which colour?', changesApplied: [] });
    const before = t.created.length;
    const q = await t.service.edit('u1', { ...base, design, instruction: 'nicer' });
    expect(q).toMatchObject({ requiresClarification: true, clarificationQuestion: 'Which colour?' });
    expect(t.created.length).toBe(before);
  });

  it('saves a poster onto a draft post by its URL, through the post rules (so approved posts are refused there)', async () => {
    const t = await build();
    t.studio.owned.mockResolvedValueOnce({ ...ASSET, id: 'poster-1', variant: 'poster', secureUrl: 'https://res.cloudinary.com/demo/image/upload/poster.jpg' } as never);
    await t.service.save('u1', '44444444-4444-4444-8444-444444444444', { postId: '33333333-3333-4333-8333-333333333333' });
    expect(t.posts.update).toHaveBeenCalledWith('u1', '33333333-3333-4333-8333-333333333333', { posterImageUrl: 'https://res.cloudinary.com/demo/image/upload/poster.jpg' });
  });

  it('will not save a plain photo as a poster', async () => {
    const t = await build();
    await expect(t.service.save('u1', '44444444-4444-4444-8444-444444444444', { postId: '33333333-3333-4333-8333-333333333333' })).rejects.toBeInstanceOf(BadRequestException);
    expect(t.posts.update).not.toHaveBeenCalled();
  });

  it('lists the four templates and marks the offer one as needing an offer', async () => {
    const t = await build();
    const options = t.service.options();
    expect(options.templates.map((x) => x.id)).toEqual(['cover_card', 'minimal_studio', 'premium_editorial', 'product_spotlight', 'offer_poster']);
    expect(options.templates.find((x) => x.id === 'offer_poster')!.needsOffer).toBe(true);
  });
});
