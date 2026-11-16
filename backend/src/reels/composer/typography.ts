import sharp from 'sharp';
import { fitText, textWidth } from '../../poster/poster-layout';
import { esc, SANS, SERIF } from '../../poster/poster-renderer';
import type { ReelLanguage, TextStyle } from '../reels.constants';
import { W } from './backgrounds';

export type Rgb = [number, number, number];

const hexRgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(typeof a === 'string' ? hexRgb(a) : a);
  const lb = luminance(typeof b === 'string' ? hexRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Large display text needs 3:1, smaller text 4.5:1 (WCAG AA). */
export const MIN_CONTRAST = { large: 3, body: 4.5 };

export interface TextLook {
  ink: string;
  sub: string;
  accent: string;
  /** The background colour measured under the text area. */
  behind: Rgb;
  /** The text sits on a photo (an AI scene), not on a plain backdrop: white ink with a firm shadow, never a backing box. */
  overPhoto?: boolean;
  style: TextStyle;
  language: ReelLanguage;
}

/** One animated text element: a full-width transparent strip placed at `y`. */
export interface TextLayer {
  png: Buffer;
  y: number;
  height: number;
  /** Seconds after the scene starts. */
  appear: number;
  anim: 'rise' | 'slide' | 'pop' | 'fade';
  /** Lowest text/background contrast in this layer, for quality control. */
  contrast: number;
  text: string;
}

const latin = (l: ReelLanguage) => l === 'en';

/**
 * The ink for one layer. On a plain backdrop it is chosen by contrast with the colour behind it. Over a photo the average
 * colour behind a line says little about the pixels under each letter, so the ink is always white with a firm shadow
 * (the composer also fades the top and bottom of an AI scene darker). The contrast recorded is still measured, against
 * the faded background, so quality control stays honest.
 */
function pickInk(look: TextLook, preferred: string, needed: number): { ink: string; plate: string | null; contrast: number; shadow: boolean } {
  if (look.overPhoto) return { ink: '#FFFFFF', plate: null, contrast: contrastRatio('#FFFFFF', look.behind), shadow: true };
  const r = readable(preferred, look.behind, needed);
  return { ...r, shadow: r.ink === '#FFFFFF' && !r.plate };
}

/** Picks ink that reads on `behind`; returns a backing plate colour when neither ink nor its opposite is enough. */
function readable(preferred: string, behind: Rgb, needed: number): { ink: string; plate: string | null; contrast: number } {
  const options = [preferred, '#FFFFFF', '#141414'];
  let best = { ink: preferred, contrast: contrastRatio(preferred, behind) };
  for (const ink of options) {
    const c = contrastRatio(ink, behind);
    if (c >= needed) return { ink, plate: null, contrast: c };
    if (c > best.contrast) best = { ink, contrast: c };
  }
  const dark = luminance(behind) > 0.4;
  const plate = dark ? '#FFFFFF' : '#000000';
  const ink = dark ? '#141414' : '#FFFFFF';
  // The plate is 72% opaque; contrast is measured against the blended colour.
  const blended = behind.map((v, i) => Math.round(v * 0.28 + hexRgb(plate)[i]! * 0.72)) as Rgb;
  return { ink, plate, contrast: contrastRatio(ink, blended) };
}

interface Font {
  family: string;
  weight: number;
  italic: boolean;
  spacing: number;
  upper: boolean;
}

function fonts(style: TextStyle, language: ReelLanguage): { title: Font; body: Font; brand: Font } {
  const L = latin(language);
  const serif = L ? SERIF : SANS;
  switch (style) {
    case 'CLASSIC':
      return { title: { family: serif, weight: 700, italic: false, spacing: 0, upper: false }, body: { family: serif, weight: 400, italic: L, spacing: 0, upper: false }, brand: { family: SANS, weight: 600, italic: false, spacing: L ? 10 : 0, upper: L } };
    case 'MODERN':
      return { title: { family: SANS, weight: 600, italic: false, spacing: L ? 1 : 0, upper: false }, body: { family: SANS, weight: 400, italic: false, spacing: 0, upper: false }, brand: { family: SANS, weight: 500, italic: false, spacing: L ? 8 : 0, upper: L } };
    case 'BOLD':
      return { title: { family: SANS, weight: 900, italic: false, spacing: L ? 1 : 0, upper: L }, body: { family: SANS, weight: 700, italic: false, spacing: 0, upper: false }, brand: { family: SANS, weight: 800, italic: false, spacing: L ? 6 : 0, upper: L } };
  }
}

function lines(content: string, box: { x: number; y: number; w: number; h: number }, font: Font, size: { max: number; min: number; lines: number }, fill: string, shadow: boolean): string {
  const text = font.upper ? content.toUpperCase() : content;
  const fit = fitText(text, { width: box.w, height: box.h }, { maxFont: size.max, minFont: size.min, maxLines: size.lines, bold: font.weight >= 700 });
  const lh = fit.fontSize * 1.22;
  const first = box.y + (box.h - fit.lines.length * lh) / 2 + fit.fontSize * 0.93;
  const attrs = `font-family="${font.family}" font-size="${fit.fontSize}" font-weight="${font.weight}" fill="${fill}"${font.italic ? ' font-style="italic"' : ''}${font.spacing ? ` letter-spacing="${font.spacing}"` : ''}${shadow ? ' filter="url(#sh)"' : ''}`;
  return fit.lines.map((l, i) => `<text x="${box.x + box.w / 2}" y="${(first + i * lh).toFixed(1)}" text-anchor="middle" ${attrs}>${esc(l)}</text>`).join('');
}

const SHADOW = '<defs><filter id="sh" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.62"/></filter></defs>';

async function strip(height: number, body: string): Promise<Buffer> {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}">${SHADOW}${body}</svg>`)).png().toBuffer();
}

const MARGIN = 80;

function plateRect(plate: string | null, height: number, width = W - MARGIN * 2): string {
  return plate ? `<rect x="${(W - width) / 2}" y="4" width="${width}" height="${height - 8}" rx="${Math.min(36, height / 2 - 4)}" fill="${plate}" fill-opacity="0.72"/>` : '';
}

export async function brandLayer(text: string, y: number, look: TextLook, appear: number): Promise<TextLayer> {
  const h = 90;
  const f = fonts(look.style, look.language).brand;
  const r = pickInk(look, look.sub, MIN_CONTRAST.body);
  const rule = `<rect x="${W / 2 - 40}" y="${h - 8}" width="80" height="3" rx="1.5" fill="${look.accent}"/>`;
  const body = plateRect(r.plate, h - 10, 640) + lines(text, { x: MARGIN, y: 0, w: W - MARGIN * 2, h: h - 14 }, f, { max: 36, min: 24, lines: 1 }, r.ink, r.shadow) + rule;
  return { png: await strip(h, body), y, height: h, appear, anim: 'fade', contrast: r.contrast, text };
}

export async function titleLayer(text: string, y: number, look: TextLook, appear: number): Promise<TextLayer> {
  const h = 230;
  const f = fonts(look.style, look.language).title;
  const r = pickInk(look, look.ink, MIN_CONTRAST.large);
  const max = look.style === 'BOLD' ? 98 : 88;
  const body = plateRect(r.plate, h) + lines(text, { x: MARGIN, y: 0, w: W - MARGIN * 2, h }, f, { max, min: 48, lines: 2 }, r.ink, r.shadow);
  return { png: await strip(h, body), y, height: h, appear, anim: 'rise', contrast: r.contrast, text };
}

export async function bodyLayer(text: string, y: number, look: TextLook, appear: number): Promise<TextLayer> {
  const h = 170;
  const f = fonts(look.style, look.language).body;
  const r = pickInk(look, look.sub, MIN_CONTRAST.body);
  const rule = `<rect x="${W / 2 - 28}" y="0" width="56" height="3" rx="1.5" fill="${look.accent}"/>`;
  const body = plateRect(r.plate, h) + rule + lines(text, { x: MARGIN + 20, y: 10, w: W - (MARGIN + 20) * 2, h: h - 10 }, f, { max: 58, min: 36, lines: 2 }, r.ink, r.shadow);
  return { png: await strip(h, body), y, height: h, appear, anim: 'rise', contrast: r.contrast, text };
}

/** A filled pill (feature label, kicker, call to action, offer). White text on the accent colour. */
export async function pillLayer(text: string, y: number, look: TextLook, appear: number, opts: { size?: number; anim?: TextLayer['anim']; fill?: string; ink?: string; align?: 'center' | 'right' } = {}): Promise<TextLayer> {
  const size = opts.size ?? 46;
  const h = Math.round(size * 2.1);
  const fill = opts.fill ?? look.accent;
  const ink = opts.ink ?? (contrastRatio('#FFFFFF', fill) >= contrastRatio('#141414', fill) ? '#FFFFFF' : '#141414');
  const shown = latin(look.language) && look.style === 'BOLD' ? text.toUpperCase() : text;
  const fit = fitText(shown, { width: W - MARGIN * 2 - size * 2, height: h }, { maxFont: size, minFont: Math.round(size * 0.6), maxLines: 1, bold: true });
  const w = Math.min(W - MARGIN * 2, Math.round(textWidth(fit.lines.join(' '), fit.fontSize, true) + fit.fontSize * 2.2));
  const left = opts.align === 'right' ? W - MARGIN - w : (W - w) / 2;
  const body =
    `<rect x="${left}" y="2" width="${w}" height="${h - 4}" rx="${(h - 4) / 2}" fill="${fill}"/>` +
    `<text x="${left + w / 2}" y="${(h / 2 + fit.fontSize * 0.36).toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="${fit.fontSize}" font-weight="700" fill="${ink}">${esc(fit.lines.join(' '))}</text>`;
  return { png: await strip(h, body), y, height: h, appear, anim: opts.anim ?? 'slide', contrast: contrastRatio(ink, fill), text };
}

/** The price: large, in the accent colour when it reads, revealed with a pop. */
export async function priceLayer(text: string, y: number, look: TextLook, appear: number): Promise<TextLayer> {
  const h = 170;
  const accentOk = !look.overPhoto && contrastRatio(look.accent, look.behind) >= MIN_CONTRAST.large;
  const r = accentOk ? { ink: look.accent, plate: null, contrast: contrastRatio(look.accent, look.behind), shadow: false } : pickInk(look, look.ink, MIN_CONTRAST.large);
  const fit = fitText(text, { width: W - MARGIN * 2, height: h }, { maxFont: 118, minFont: 64, maxLines: 1, bold: true });
  const w = textWidth(text, fit.fontSize, true);
  const body =
    plateRect(r.plate, h, Math.min(W - MARGIN * 2, w + 120)) +
    `<text x="${W / 2}" y="${(h / 2 + fit.fontSize * 0.36).toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="${fit.fontSize}" font-weight="800" fill="${r.ink}"${r.shadow ? ' filter="url(#sh)"' : ''}>${esc(text)}</text>`;
  return { png: await strip(h, body), y, height: h, appear, anim: 'pop', contrast: r.contrast, text };
}

/** Brand mark for the ending: a monogram roundel with the shop name under it (the business has no logo upload). */
export async function monogramLayer(brand: string, y: number, look: TextLook, appear: number): Promise<TextLayer> {
  const h = 190;
  const initials =
    brand
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0]!.toUpperCase())
      .join('') || '•';
  const r = pickInk(look, look.ink, MIN_CONTRAST.body);
  const f = fonts(look.style, look.language).brand;
  const ring = `<circle cx="${W / 2}" cy="56" r="52" fill="none" stroke="${look.accent}" stroke-width="3"/><text x="${W / 2}" y="${56 + 15}" text-anchor="middle" font-family="${SERIF}" font-size="44" font-weight="700" fill="${r.ink}">${esc(initials)}</text>`;
  const body = plateRect(r.plate, h, 640) + ring + lines(brand, { x: MARGIN, y: 120, w: W - MARGIN * 2, h: 64 }, f, { max: 34, min: 22, lines: 1 }, r.ink, r.shadow);
  return { png: await strip(h, body), y, height: h, appear, anim: 'fade', contrast: r.contrast, text: brand };
}
