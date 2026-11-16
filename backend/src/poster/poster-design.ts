import { z } from 'zod';
import { allowedNumbers, cleanPrice, unsupportedNumbers } from '../ai/facts';

/**
 * The poster design: a plain description of how to lay out the poster. Claude proposes one and the owner can change
 * any part of it. It describes layout and colour only. It is never used to claim an image was edited, and it never
 * carries a price: the price is added by the renderer from a verified source.
 */
export const TEMPLATES = ['cover_card', 'minimal_studio', 'premium_editorial', 'product_spotlight', 'offer_poster'] as const;
export const BACKGROUND_STYLES = ['solid', 'gradient'] as const;
export const PHOTO_TREATMENTS = ['natural', 'brighter', 'vivid', 'soft'] as const;
export const ALIGNMENTS = ['center', 'left', 'right'] as const;
export const TEXT_POSITIONS = ['top', 'bottom'] as const;
export const PRICE_POSITIONS = ['bottom-right', 'bottom-left'] as const;
const GRADIENT_DIRECTIONS = ['vertical', 'diagonal'] as const;
/** 'auto' keeps each template's own type; the others are the owner's choice. */
export const FONT_STYLES = ['auto', 'clean', 'modern', 'elegant', 'bold', 'friendly'] as const;

export type Template = (typeof TEMPLATES)[number];

/** The button text on posters: customers are sent to the shop's DMs. */
export function dmCallToAction(language: string | null | undefined): string {
  return language === 'hi' ? 'अभी DM करें' : language === 'mr' ? 'आता DM करा' : 'DM Now';
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normaliseHex(value: string): string {
  const v = value.trim().toUpperCase();
  return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
}

const hex = z
  .string()
  .refine((v) => HEX.test(v.trim()), 'must be a hex colour such as #F6EFE3')
  .transform(normaliseHex);

const GradientSchema = z.object({ from: hex, to: hex, direction: z.enum(GRADIENT_DIRECTIONS) });

/** What the renderer accepts. Strict: anything outside these lists is rejected, never guessed. */
const PosterDesignSchema = z.object({
  template: z.enum(TEMPLATES),
  backgroundStyle: z.enum(BACKGROUND_STYLES),
  backgroundColor: hex,
  backgroundGradient: GradientSchema.nullable(),
  photoTreatment: z.enum(PHOTO_TREATMENTS),
  productAlignment: z.enum(ALIGNMENTS),
  headline: z.string().trim().max(80),
  showHeadline: z.boolean(),
  headlinePosition: z.enum(TEXT_POSITIONS),
  showPrice: z.boolean(),
  pricePosition: z.enum(PRICE_POSITIONS),
  callToAction: z.string().trim().max(40),
  textColor: hex,
  accentColor: hex,
  fontStyle: z.enum(FONT_STYLES).default('auto'),
});
export type PosterDesign = z.infer<typeof PosterDesignSchema>;

const ModelGradient = z.object({ from: z.string(), to: z.string(), direction: z.enum(GRADIENT_DIRECTIONS) });

/**
 * What Claude is asked to return. Colours are plain strings here (a model-facing schema stays simple) and are checked
 * with the strict schema above straight after.
 */
export const ModelDesignSchema = z.object({
  template: z.enum(TEMPLATES),
  backgroundStyle: z.enum(BACKGROUND_STYLES),
  backgroundColor: z.string(),
  backgroundGradient: ModelGradient.nullable(),
  photoTreatment: z.enum(PHOTO_TREATMENTS),
  productAlignment: z.enum(ALIGNMENTS),
  headline: z.string(),
  headlinePosition: z.enum(TEXT_POSITIONS),
  showPrice: z.boolean(),
  pricePosition: z.enum(PRICE_POSITIONS),
  callToAction: z.string(),
  textColor: z.string(),
  accentColor: z.string(),
  reasoning: z.string(),
});
export type ModelDesign = z.infer<typeof ModelDesignSchema>;

/** A small change to an existing design, from a short spoken or typed instruction (Haiku). */
export const ModelPatchSchema = z.object({
  template: z.enum(TEMPLATES).nullable(),
  backgroundStyle: z.enum(BACKGROUND_STYLES).nullable(),
  backgroundColor: z.string().nullable(),
  backgroundGradient: ModelGradient.nullable(),
  photoTreatment: z.enum(PHOTO_TREATMENTS).nullable(),
  productAlignment: z.enum(ALIGNMENTS).nullable(),
  showHeadline: z.boolean().nullable(),
  headlinePosition: z.enum(TEXT_POSITIONS).nullable(),
  showPrice: z.boolean().nullable(),
  pricePosition: z.enum(PRICE_POSITIONS).nullable(),
  textColor: z.string().nullable(),
  accentColor: z.string().nullable(),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
  changesApplied: z.array(z.string()),
});
export type ModelPatch = z.infer<typeof ModelPatchSchema>;

export class InvalidDesignError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid poster design: ${problems.join('; ')}`);
  }
}

// ---------- colour maths (readability) ----------

function channels(color: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const MIN_TEXT_CONTRAST = 4.5;
const DARK_TEXT = '#241C15';
const LIGHT_TEXT = '#FFFFFF';

/** The colour that reads best on `background`: the wanted one if it is readable, otherwise dark or light. */
export function readableOn(background: string, wanted: string): string {
  if (contrastRatio(background, wanted) >= MIN_TEXT_CONTRAST) return wanted;
  return contrastRatio(background, DARK_TEXT) >= contrastRatio(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

/** The average colour of the background the text sits on: the solid colour, or the middle of the gradient. */
function backdropColor(design: Pick<PosterDesign, 'backgroundStyle' | 'backgroundColor' | 'backgroundGradient'>): string {
  if (design.backgroundStyle !== 'gradient' || !design.backgroundGradient) return design.backgroundColor;
  const a = channels(design.backgroundGradient.from);
  const b = channels(design.backgroundGradient.to);
  return `#${a.map((v, i) => Math.round((v + b[i]!) / 2).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Text colour is repaired for contrast rather than rejected: the owner never gets unreadable text. */
export function ensureReadable(design: PosterDesign): PosterDesign {
  return { ...design, textColor: readableOn(backdropColor(design), design.textColor) };
}

// ---------- templates ----------

export interface TemplateInfo {
  id: Template;
  name: string;
  summary: string;
  /** Needs an offer the owner typed. */
  needsOffer: boolean;
  defaults: Pick<PosterDesign, 'backgroundStyle' | 'backgroundColor' | 'backgroundGradient' | 'photoTreatment' | 'textColor' | 'accentColor' | 'headlinePosition' | 'productAlignment'>;
}

export const TEMPLATE_INFO: Record<Template, TemplateInfo> = {
  // RESTORED: this entry was overwritten by mistake and rebuilt from how the renderer uses it: a light fade at the top
  // carries the headline in dark ink (so the base colour is white and the ink dark violet), a violet fade at the bottom
  // carries the white price and button, and the accent fades into the brand pink. Compare with the original if you have it.
  cover_card: {
    id: 'cover_card',
    name: 'Cover Card',
    summary: 'Your photo fills the whole poster, with the headline, price and call to action on top.',
    needsOffer: false,
    defaults: { backgroundStyle: 'solid', backgroundColor: '#FFFFFF', backgroundGradient: null, photoTreatment: 'natural', textColor: '#1F1640', accentColor: '#5F33D4', headlinePosition: 'top', productAlignment: 'center' },
  },
  minimal_studio: {
    id: 'minimal_studio',
    name: 'Minimal Studio',
    summary: 'Clean light background, large centred product, a subtle price badge.',
    needsOffer: false,
    defaults: { backgroundStyle: 'solid', backgroundColor: '#F5F6F8', backgroundGradient: null, photoTreatment: 'natural', textColor: '#1F2430', accentColor: '#3B4A6B', headlinePosition: 'top', productAlignment: 'center' },
  },
  premium_editorial: {
    id: 'premium_editorial',
    name: 'Premium Editorial',
    summary: 'Deep charcoal with elegant serif type.',
    needsOffer: false,
    defaults: { backgroundStyle: 'gradient', backgroundColor: '#22262F', backgroundGradient: { from: '#2C313C', to: '#171A22', direction: 'vertical' }, photoTreatment: 'natural', textColor: '#F3F4F6', accentColor: '#C9A66B', headlinePosition: 'top', productAlignment: 'center' },
  },
  product_spotlight: {
    id: 'product_spotlight',
    name: 'Product Spotlight',
    summary: 'The largest product, with a strong visual hierarchy.',
    needsOffer: false,
    defaults: { backgroundStyle: 'gradient', backgroundColor: '#F2F4F9', backgroundGradient: { from: '#FFFFFF', to: '#E4E9F2', direction: 'diagonal' }, photoTreatment: 'natural', textColor: '#1A1F2B', accentColor: '#6D4AE0', headlinePosition: 'top', productAlignment: 'center' },
  },
  offer_poster: {
    id: 'offer_poster',
    name: 'Offer Poster',
    summary: 'A promotional layout for an offer you provide.',
    needsOffer: true,
    defaults: { backgroundStyle: 'gradient', backgroundColor: '#FFEAE6', backgroundGradient: { from: '#FFF6F3', to: '#FFD3CB', direction: 'vertical' }, photoTreatment: 'natural', textColor: '#2A1410', accentColor: '#D6336C', headlinePosition: 'bottom', productAlignment: 'center' },
  },
};

export function defaultTemplateFor(_category: string | null | undefined, hasOffer: boolean): Template {
  return hasOffer ? 'offer_poster' : 'cover_card';
}

/** A complete, valid design from a template's own palette. Used when no usable AI design exists. */
export function templateDesign(template: Template, text: { headline: string; callToAction: string }, priceVerified: boolean): PosterDesign {
  const d = TEMPLATE_INFO[template].defaults;
  return ensureReadable({
    template,
    ...d,
    headline: text.headline.slice(0, 80),
    showHeadline: text.headline.trim().length > 0,
    showPrice: priceVerified,
    pricePosition: template === 'cover_card' ? 'bottom-left' : 'bottom-right',
    callToAction: text.callToAction.slice(0, 40),
    fontStyle: 'auto',
  });
}

// ---------- facts: price and offer ----------

export interface VerifiedFacts {
  /** Digits only, from the product record or typed by the owner. Never from Claude. */
  price: string | null;
  priceSource: 'owner' | 'product' | null;
  currency: string;
  /** An offer the owner typed, shown word for word. */
  offer: string | null;
}

/** "₹1,299" style text with Indian digit grouping. Null when there is no verified price. */
export function formatPrice(price: string | null, currency = 'INR'): string | null {
  const clean = cleanPrice(price);
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n <= 0) return null;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  const [whole, fraction] = clean.split('.');
  const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(whole));
  return `${symbol}${grouped}${fraction && Number(fraction) > 0 ? `.${fraction}` : ''}`;
}

/**
 * Turns Claude's proposal into a valid design the owner can trust:
 *  - colours must be real hex colours (else the whole proposal is rejected),
 *  - the offer template needs an offer the owner typed, otherwise a normal template is used,
 *  - text may not contain numbers that are not in the owner's own text, price, offer or shop name,
 *  - the price flag is honoured only when a price was verified,
 *  - text colour is repaired for contrast.
 * Returns the design plus plain-language notes about anything that was corrected.
 */
export function acceptModelDesign(
  proposal: ModelDesign,
  context: { text: { headline: string; callToAction: string }; facts: VerifiedFacts; category: string | null; shopName: string },
): { design: PosterDesign; notes: string[] } {
  const notes: string[] = [];
  let template = proposal.template;
  if (template === 'offer_poster' && !context.facts.offer) {
    template = defaultTemplateFor(context.category, false);
    notes.push('An offer poster needs an offer you provide, so a regular layout was used.');
  }

  const allowed = allowedNumbers([context.text.headline, context.text.callToAction, context.facts.offer, context.facts.price, context.shopName]);
  const bad = unsupportedNumbers([proposal.headline, proposal.callToAction], allowed);
  const headline = bad.length ? context.text.headline : proposal.headline.trim() || context.text.headline;
  const callToAction = context.text.callToAction.trim() || (bad.length ? '' : proposal.callToAction.trim());
  if (bad.length) notes.push('The AI added numbers that are not yours, so your own text was kept.');

  const parsed = PosterDesignSchema.safeParse({
    template,
    backgroundStyle: proposal.backgroundStyle,
    backgroundColor: proposal.backgroundColor,
    backgroundGradient: proposal.backgroundStyle === 'gradient' ? proposal.backgroundGradient : null,
    photoTreatment: proposal.photoTreatment,
    productAlignment: proposal.productAlignment,
    headline,
    showHeadline: headline.length > 0,
    headlinePosition: proposal.headlinePosition,
    showPrice: proposal.showPrice,
    pricePosition: proposal.pricePosition,
    callToAction,
    textColor: proposal.textColor,
    accentColor: proposal.accentColor,
  });
  if (!parsed.success) throw new InvalidDesignError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  let design = parsed.data;
  if (design.backgroundStyle === 'gradient' && !design.backgroundGradient) {
    design = { ...design, backgroundGradient: TEMPLATE_INFO[design.template].defaults.backgroundGradient ?? { from: design.backgroundColor, to: design.backgroundColor, direction: 'vertical' } };
  }
  if (design.showPrice && !context.facts.price) {
    design = { ...design, showPrice: false };
    notes.push('No verified price, so no price badge was added.');
  }
  return { design: ensureReadable(design), notes };
}

/** Owner-supplied or edited designs: checked strictly, then made readable, and the price flag is made honest. */
export function acceptOwnerDesign(input: unknown, facts: VerifiedFacts): { design: PosterDesign; notes: string[] } {
  const parsed = PosterDesignSchema.safeParse(input);
  if (!parsed.success) throw new InvalidDesignError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const notes: string[] = [];
  let design = parsed.data;
  if (design.template === 'offer_poster' && !facts.offer) {
    throw new InvalidDesignError(['template: the Offer Poster needs an offer that you provide']);
  }
  if (design.backgroundStyle === 'gradient' && !design.backgroundGradient) {
    throw new InvalidDesignError(['backgroundGradient: required for a gradient background']);
  }
  if (design.showPrice && !facts.price) {
    design = { ...design, showPrice: false };
    notes.push('No verified price, so no price badge was added.');
  }
  return { design: ensureReadable(design), notes };
}

/** Applies a Haiku patch to a design. Only the fields it set change; colours are validated like everything else. */
export function applyPatch(current: PosterDesign, patch: ModelPatch, facts: VerifiedFacts): { design: PosterDesign; notes: string[] } {
  const next: Record<string, unknown> = { ...current };
  const keys = ['template', 'backgroundStyle', 'backgroundColor', 'backgroundGradient', 'photoTreatment', 'productAlignment', 'showHeadline', 'headlinePosition', 'showPrice', 'pricePosition', 'textColor', 'accentColor'] as const;
  for (const key of keys) if (patch[key] !== null && patch[key] !== undefined) next[key] = patch[key];

  if (patch.backgroundStyle === 'solid') next['backgroundGradient'] = null;
  if (next['backgroundStyle'] === 'gradient' && !next['backgroundGradient']) {
    next['backgroundGradient'] = TEMPLATE_INFO[next['template'] as Template].defaults.backgroundGradient ?? { from: next['backgroundColor'], to: next['backgroundColor'], direction: 'vertical' };
  }
  // A new template brings its own palette, unless the patch chose colours or a background itself.
  const choseLook = patch.backgroundColor !== null || patch.backgroundGradient !== null || patch.backgroundStyle !== null;
  if (patch.template && patch.template !== current.template && !choseLook) {
    const d = TEMPLATE_INFO[patch.template].defaults;
    Object.assign(next, { ...d, photoTreatment: patch.photoTreatment ?? d.photoTreatment, productAlignment: patch.productAlignment ?? d.productAlignment, headlinePosition: patch.headlinePosition ?? d.headlinePosition });
  }
  const notes: string[] = [];
  if (next['template'] === 'offer_poster' && !facts.offer) {
    next['template'] = current.template === 'offer_poster' ? 'minimal_studio' : current.template;
    notes.push('An offer poster needs an offer you provide, so the layout was not changed.');
  }
  const accepted = acceptOwnerDesign(next, facts);
  return { design: accepted.design, notes: [...notes, ...accepted.notes] };
}
