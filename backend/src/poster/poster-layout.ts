import type { PosterDesign, Template } from './poster-design';

/** Instagram portrait feed size (4:5). */
export const CANVAS = { width: 1080, height: 1350 } as const;
/** The photo frame runs almost edge to edge. */
const MARGIN = 10;
/** Text, the offer ribbon and the price badge keep a real safe margin from the edge (phones round the corners; feeds crop). */
const TEXT_MARGIN = 48;
const GAP = 12;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  /** The frame the product photo is fitted into. No text, badge or ribbon ever overlaps it. */
  photo: Rect;
  headline: Rect | null;
  offer: Rect | null;
  cta: Rect | null;
  badge: Rect | null;
  /** Where the CTA text is aligned inside its rect. */
  ctaAlign: 'start' | 'middle' | 'end';
  headlineAlign: 'start' | 'middle';
  /** Photo corner radius. */
  radius: number;
  serif: boolean;
}

interface Params {
  frameWidth: number;
  radius: number;
  topPad: number;
  headlineHeight: number;
  headlineAlign: 'start' | 'middle';
  bandHeight: number;
  serif: boolean;
  /** Extra height at the top for the offer ribbon. */
  ribbon: number;
}

const PARAMS: Record<Template, Params> = {
  cover_card: { frameWidth: 1080, radius: 0, topPad: 0, headlineHeight: 0, headlineAlign: 'start', bandHeight: 0, serif: false, ribbon: 0 },
  minimal_studio: { frameWidth: 1060, radius: 28, topPad: 16, headlineHeight: 120, headlineAlign: 'middle', bandHeight: 130, serif: false, ribbon: 0 },
  premium_editorial: { frameWidth: 1060, radius: 6, topPad: 16, headlineHeight: 130, headlineAlign: 'start', bandHeight: 130, serif: true, ribbon: 0 },
  product_spotlight: { frameWidth: 1060, radius: 24, topPad: 12, headlineHeight: 112, headlineAlign: 'middle', bandHeight: 124, serif: false, ribbon: 0 },
  offer_poster: { frameWidth: 1060, radius: 26, topPad: 12, headlineHeight: 0, headlineAlign: 'middle', bandHeight: 130, serif: false, ribbon: 120 },
};

const BADGE_HEIGHT = 96;

const COVER = { margin: 48, headlineY: 64, headlineHeight: 150, rowHeight: 110, ctaHeight: 88 } as const;

/** The Cover Card: the photo fills the canvas, so `photo` is only the clear middle that text and badges never enter. */
function coverLayout(design: PosterDesign, priceText: string | null): Layout {
  const { margin, headlineY, headlineHeight, rowHeight, ctaHeight } = COVER;
  const inner = CANVAS.width - 2 * margin;
  const rowTop = CANVAS.height - margin - rowHeight;
  const headlineOn = design.showHeadline && design.headline.trim().length > 0;
  const badgeLeft = design.pricePosition === 'bottom-left';

  let badge: Rect | null = null;
  if (design.showPrice && priceText) {
    const w = badgeWidth(priceText);
    badge = { x: badgeLeft ? margin : CANVAS.width - margin - w, y: rowTop + Math.round((rowHeight - BADGE_HEIGHT) / 2), width: w, height: BADGE_HEIGHT };
  }
  let cta: Rect | null = null;
  if (design.callToAction.trim().length > 0) {
    const room = badge ? inner - badge.width - 40 : inner;
    const w = Math.min(room, Math.max(260, Math.round(textWidth(design.callToAction, 40, true) + 96)));
    cta = { x: badgeLeft || !badge ? CANVAS.width - margin - w : margin, y: rowTop + Math.round((rowHeight - ctaHeight) / 2), width: w, height: ctaHeight };
  }
  const top = headlineY + headlineHeight + 16;
  return {
    photo: { x: 0, y: top, width: CANVAS.width, height: rowTop - 16 - top },
    headline: headlineOn ? { x: margin, y: headlineY, width: inner, height: headlineHeight } : null,
    offer: null,
    cta,
    badge,
    ctaAlign: 'middle',
    headlineAlign: 'start',
    radius: 0,
    serif: false,
  };
}
export const BADGE_FONT = 52;

/** Rough text width in pixels. Good enough to size badges and wrap lines; the renderer never relies on it for the photo. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0900 && code <= 0x097f) units += /[ा-ॏ॑-ॗऀ-ः़]/.test(ch) ? 0 : 0.62; // Devanagari: marks add no width
    else if (ch === ' ') units += 0.28;
    else if (code > 0x2e80) units += 1;
    else if (/[A-Z0-9₹]/.test(ch)) units += 0.68;
    else units += 0.55;
  }
  return units * fontSize * (bold ? 1.06 : 1);
}

function badgeWidth(priceText: string): number {
  return Math.round(Math.max(210, textWidth(priceText, BADGE_FONT, true) + 84));
}

/**
 * Where everything goes. A pure function of the design, so it can be tested without any image:
 * the photo frame is reserved first, then text, offer ribbon and price badge are placed in the space around it.
 */
export function computeLayout(design: PosterDesign, opts: { priceText: string | null; offerText: string | null }): Layout {
  if (design.template === 'cover_card') return coverLayout(design, opts.priceText);
  const p = PARAMS[design.template];
  const offer = design.template === 'offer_poster' && opts.offerText ? opts.offerText : null;
  const headlineOn = design.showHeadline && design.headline.trim().length > 0;
  const badgeOn = design.showPrice && !!opts.priceText;
  const headlineAtBottom = design.template === 'offer_poster' || design.headlinePosition === 'bottom';

  const inner = CANVAS.width - 2 * MARGIN;
  const textInner = CANVAS.width - 2 * TEXT_MARGIN;
  const topHeadline = headlineOn && !headlineAtBottom ? p.headlineHeight : 0;
  const bottomHeadline = headlineOn && headlineAtBottom ? Math.max(p.headlineHeight, 110) : 0;
  const ribbon = offer ? p.ribbon : 0;

  const bandTop = CANVAS.height - TEXT_MARGIN - p.bandHeight - bottomHeadline;
  const top = p.topPad + ribbon + topHeadline;
  const photoHeight = bandTop - GAP - top;
  const frameWidth = Math.min(p.frameWidth, inner);
  const x = design.productAlignment === 'left' ? MARGIN : design.productAlignment === 'right' ? CANVAS.width - MARGIN - frameWidth : Math.round((CANVAS.width - frameWidth) / 2);
  const photo: Rect = { x, y: top, width: frameWidth, height: photoHeight };

  const offerRect: Rect | null = offer ? { x: TEXT_MARGIN, y: p.topPad, width: textInner, height: ribbon - 20 } : null;
  const headlineRect: Rect | null = headlineOn
    ? headlineAtBottom
      ? { x: TEXT_MARGIN, y: bandTop, width: textInner, height: bottomHeadline - 8 }
      : { x: TEXT_MARGIN, y: p.topPad, width: textInner, height: p.headlineHeight - 24 }
    : null;

  // CTA and badge share the bottom row; the CTA takes the side opposite the badge, or the whole row when there is none.
  const rowTop = bandTop + bottomHeadline;
  const rowHeight = p.bandHeight;
  let badge: Rect | null = null;
  let cta: Rect | null = null;
  let ctaAlign: Layout['ctaAlign'] = 'middle';
  const hasCta = design.callToAction.trim().length > 0;
  if (badgeOn) {
    const w = badgeWidth(opts.priceText!);
    const bx = design.pricePosition === 'bottom-left' ? TEXT_MARGIN : CANVAS.width - TEXT_MARGIN - w;
    badge = { x: bx, y: rowTop + Math.round((rowHeight - BADGE_HEIGHT) / 2), width: w, height: BADGE_HEIGHT };
    if (hasCta) {
      const ctaWidth = textInner - w - 40;
      cta = { x: design.pricePosition === 'bottom-left' ? TEXT_MARGIN + w + 40 : TEXT_MARGIN, y: rowTop, width: ctaWidth, height: rowHeight };
      ctaAlign = design.pricePosition === 'bottom-left' ? 'end' : 'start';
    }
  } else if (hasCta) {
    cta = { x: TEXT_MARGIN, y: rowTop, width: textInner, height: rowHeight };
  }

  return { photo, headline: headlineRect, offer: offerRect, cta, badge, ctaAlign, headlineAlign: p.headlineAlign, radius: p.radius, serif: p.serif };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The size the photo takes inside its frame: as large as fits, never cropped, never stretched. */
export function fitInside(source: { width: number; height: number }, frame: Rect): Rect {
  const scale = Math.min(frame.width / source.width, frame.height / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  return { x: frame.x + Math.round((frame.width - width) / 2), y: frame.y + Math.round((frame.height - height) / 2), width, height };
}

export interface FittedText {
  lines: string[];
  fontSize: number;
}

/** Wraps `text` to fit a box, shrinking the font if needed. Words are never split; a very long single word shrinks instead. */
export function fitText(text: string, box: { width: number; height: number }, opts: { maxFont: number; minFont: number; maxLines: number; bold?: boolean }): FittedText {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let font = opts.maxFont; font >= opts.minFont; font -= 2) {
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, font, opts.bold) > box.width) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    const fitsWidth = lines.every((l) => textWidth(l, font, opts.bold) <= box.width);
    if (fitsWidth && lines.length <= opts.maxLines && lines.length * font * 1.22 <= box.height) return { lines, fontSize: font };
  }
  // Last resort: the smallest size, trimmed to the allowed lines. Text stays inside the box.
  const font = opts.minFont;
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, font, opts.bold) > box.width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  const kept = lines.slice(0, opts.maxLines);
  if (lines.length > opts.maxLines) kept[kept.length - 1] = `${kept[kept.length - 1]!.replace(/[\s.,]+$/, '')}…`;
  return { lines: kept, fontSize: font };
}
