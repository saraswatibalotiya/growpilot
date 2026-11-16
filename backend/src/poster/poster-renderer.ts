import sharp from 'sharp';
import type { PosterDesign } from './poster-design';
import { readableOn } from './poster-design';
import { BADGE_FONT, CANVAS, computeLayout, fitInside, fitText, type Layout, type Rect } from './poster-layout';

export class PosterRenderError extends Error {}

export interface RenderInput {
  /** The product photo exactly as stored (original or Photo Studio version). It is never modified on disk. */
  photo: Buffer;
  design: PosterDesign;
  /** Already formatted from a verified price, for example "₹899". Null means no badge. */
  priceText: string | null;
  /** Typed by the owner, shown word for word on the Offer Poster. */
  offerText: string | null;
}

export interface RenderResult {
  buffer: Buffer;
  layout: Layout;
  /** The area the photo actually occupies (inside the frame). */
  photoRect: Rect;
}

const DEVANAGARI = "'Noto Sans Devanagari', 'Devanagari Sangam MN'";
export const SANS = `'Helvetica Neue', Helvetica, Arial, 'Noto Sans', ${DEVANAGARI}, sans-serif`;
export const SERIF = `Georgia, 'Times New Roman', 'Noto Serif', 'Noto Serif Devanagari', 'Devanagari Sangam MN', serif`;

/** Owner-selectable type. Each stack lists good fonts first and always ends in something every machine has. */
const FONTS: Record<Exclude<PosterDesign['fontStyle'], 'auto'>, { family: string; weight: number; letterSpacing?: number }> = {
  clean: { family: SANS, weight: 800 },
  modern: { family: `'Avenir Next', Avenir, Futura, 'Century Gothic', Montserrat, 'Noto Sans', ${DEVANAGARI}, sans-serif`, weight: 700, letterSpacing: 1 },
  elegant: { family: `'Playfair Display', Didot, 'Bodoni 72', Georgia, 'Noto Serif', 'Noto Serif Devanagari', 'Devanagari Sangam MN', serif`, weight: 700 },
  bold: { family: `'Arial Black', 'Helvetica Neue', Impact, Arial, 'Noto Sans', ${DEVANAGARI}, sans-serif`, weight: 900 },
  friendly: { family: `'Avenir Next Rounded', 'Trebuchet MS', Verdana, 'Noto Sans', ${DEVANAGARI}, sans-serif`, weight: 700 },
};

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Gentle, fixed adjustments. Nothing here can change what the product looks like beyond a slight tone shift. */
const TREATMENTS: Record<PosterDesign['photoTreatment'], { brightness: number; saturation: number; contrast: number }> = {
  natural: { brightness: 1, saturation: 1, contrast: 1 },
  brighter: { brightness: 1.06, saturation: 1.02, contrast: 1.04 },
  vivid: { brightness: 1.02, saturation: 1.09, contrast: 1.03 },
  soft: { brightness: 1.03, saturation: 0.97, contrast: 0.97 },
};

function backgroundSvg(design: PosterDesign): Buffer {
  const { width, height } = CANVAS;
  let fill = design.backgroundColor;
  let defs = '';
  if (design.backgroundStyle === 'gradient' && design.backgroundGradient) {
    const g = design.backgroundGradient;
    const [x2, y2] = g.direction === 'diagonal' ? ['1', '1'] : ['0', '1'];
    defs = `<defs><linearGradient id="bg" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient></defs>`;
    fill = 'url(#bg)';
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${defs}<rect width="${width}" height="${height}" fill="${fill}"/></svg>`);
}

function roundedMask(width: number, height: number, radius: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
}

/** A soft drop shadow under the photo on a canvas-sized layer (so it is clipped at the edge, never an error). */
function shadowSvg(rect: Rect, radius: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}"><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>` +
      `<rect x="${rect.x}" y="${rect.y + 8}" width="${rect.width}" height="${rect.height}" rx="${radius}" fill="#000" fill-opacity="0.22" filter="url(#b)"/></svg>`,
  );
}

function textBlock(lines: string[], rect: Rect, fontSize: number, opts: { align: 'start' | 'middle' | 'end'; fill: string; family: string; weight: number; italic?: boolean; letterSpacing?: number }): string {
  const lineHeight = fontSize * 1.2;
  const total = lines.length * lineHeight;
  const firstBaseline = rect.y + (rect.height - total) / 2 + fontSize * 0.92;
  const x = opts.align === 'start' ? rect.x : opts.align === 'end' ? rect.x + rect.width : rect.x + rect.width / 2;
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${(firstBaseline + i * lineHeight).toFixed(1)}" text-anchor="${opts.align}" font-family="${opts.family}" font-size="${fontSize}" font-weight="${opts.weight}" fill="${opts.fill}"${opts.italic ? ' font-style="italic"' : ''}${opts.letterSpacing ? ` letter-spacing="${opts.letterSpacing}"` : ''}>${esc(line)}</text>`,
    )
    .join('');
}

function overlaySvg(design: PosterDesign, layout: Layout, input: RenderInput): Buffer {
  const chosen = design.fontStyle === 'auto' ? null : FONTS[design.fontStyle];
  const family = chosen?.family ?? (layout.serif ? SERIF : SANS);
  const headlineWeight = chosen?.weight ?? (layout.serif ? 600 : 800);
  const headlineItalic = !chosen && layout.serif;
  const tracking = chosen?.letterSpacing ?? (layout.serif ? 1 : 0);
  const parts: string[] = [];
  const cover = design.template === 'cover_card';

  if (layout.offer && input.offerText) {
    const r = layout.offer;
    const onAccent = readableOn(design.accentColor, '#FFFFFF');
    const fit = fitText(input.offerText, { width: r.width - 80, height: r.height - 24 }, { maxFont: 76, minFont: 34, maxLines: 2, bold: true });
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="26" fill="${design.accentColor}"/>`);
    parts.push(textBlock(fit.lines, r, fit.fontSize, { align: 'middle', fill: onAccent, family, weight: chosen?.weight ?? 800 }));
  }

  if (layout.headline && design.showHeadline && design.headline) {
    const r = layout.headline;
    const fit = fitText(design.headline, { width: r.width, height: r.height }, { maxFont: layout.serif ? 64 : 70, minFont: 30, maxLines: 2, bold: true });
    parts.push(textBlock(fit.lines, r, fit.fontSize, { align: layout.headlineAlign, fill: design.textColor, family, weight: headlineWeight, italic: headlineItalic }));
    if (layout.serif && layout.headlineAlign === 'start') {
      parts.push(`<rect x="${r.x}" y="${r.y + r.height + 6}" width="96" height="4" fill="${design.accentColor}"/>`);
    }
  }

  if (layout.cta && design.callToAction) {
    const r = layout.cta;
    if (cover) {
      const fit = fitText(design.callToAction, { width: r.width - 48, height: r.height - 16 }, { maxFont: 40, minFont: 26, maxLines: 1, bold: true });
      parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.height / 2}" fill="#FFFFFF"/>`);
      parts.push(textBlock(fit.lines, r, fit.fontSize, { align: 'middle', fill: design.accentColor, family, weight: chosen ? Math.min(chosen.weight, 800) : 800 }));
    } else {
      const fit = fitText(design.callToAction, { width: r.width, height: Math.min(r.height, 150) }, { maxFont: 46, minFont: 28, maxLines: 2, bold: true });
      parts.push(textBlock(fit.lines, r, fit.fontSize, { align: layout.ctaAlign, fill: design.textColor, family, weight: chosen ? Math.min(chosen.weight, 800) : 700, letterSpacing: tracking }));
    }
  }

  if (layout.badge && input.priceText) {
    const b = layout.badge;
    const onAccent = cover ? '#FFFFFF' : readableOn(design.accentColor, '#FFFFFF');
    const fill = cover ? 'url(#pill)' : design.accentColor;
    const pill = cover ? `<linearGradient id="pill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${design.accentColor}"/><stop offset="1" stop-color="#EE4F99"/></linearGradient>` : '';
    parts.push(
      `<defs>${pill}<filter id="bs" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#000" flood-opacity="0.22"/></filter></defs>` +
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.height / 2}" fill="${fill}" filter="url(#bs)"/>` +
        textBlock([input.priceText], b, BADGE_FONT, { align: 'middle', fill: onAccent, family: chosen?.family ?? SANS, weight: 800 }),
    );
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">${parts.join('')}</svg>`);
}

/** Light fade at the top for the headline, deep violet fade at the bottom for the price and button. */
function coverShadeSvg(): Buffer {
  const { width, height } = CANVAS;
  const split = Math.round(height * 0.38);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>` +
      `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F1640" stop-opacity="0"/><stop offset="1" stop-color="#1F1640" stop-opacity="0.55"/></linearGradient></defs>` +
      `<rect width="${width}" height="${split}" fill="url(#t)"/><rect y="${split}" width="${width}" height="${height - split}" fill="url(#b)"/></svg>`,
  );
}

/** The Cover Card: the photo fills the whole canvas (the best 4:5 crop of it), with soft fades and the text on top. */
async function renderCover(input: RenderInput): Promise<RenderResult> {
  const { design } = input;
  const layout = computeLayout(design, { priceText: input.priceText, offerText: null });
  const t = TREATMENTS[design.photoTreatment];
  let base: Buffer;
  try {
    let pipeline = sharp(input.photo, { failOn: 'error' }).rotate().resize(CANVAS.width, CANVAS.height, { fit: 'cover', position: sharp.strategy.attention, kernel: 'lanczos3' });
    if (t.brightness !== 1 || t.saturation !== 1) pipeline = pipeline.modulate({ brightness: t.brightness, saturation: t.saturation });
    if (t.contrast !== 1) pipeline = pipeline.linear(t.contrast, 128 * (1 - t.contrast));
    base = await pipeline.removeAlpha().png().toBuffer();
  } catch {
    throw new PosterRenderError('The photo could not be read. Please upload a JPEG, PNG or WEBP photo.');
  }
  const buffer = await sharp(base)
    .composite([
      { input: coverShadeSvg(), left: 0, top: 0 },
      { input: overlaySvg(design, layout, input), left: 0, top: 0 },
    ])
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return { buffer, layout, photoRect: { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height } };
}

/**
 * Draws the poster. The product photo is only resized to fit its frame (never cropped or stretched), gets a gentle
 * tone adjustment if one was chosen, and rounded corners. Text, badge and ribbon are drawn in the space around it,
 * so nothing covers the product. Throws PosterRenderError for an unreadable photo.
 */
export async function renderPoster(input: RenderInput): Promise<RenderResult> {
  if (input.design.template === 'cover_card') return renderCover(input);
  const { design } = input;
  const layout = computeLayout(design, { priceText: input.priceText, offerText: input.offerText });

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input.photo, { failOn: 'error' }).metadata();
  } catch {
    throw new PosterRenderError('The photo could not be read. Please upload a JPEG, PNG or WEBP photo.');
  }
  // EXIF rotation swaps width and height; work with the displayed orientation.
  const rotated = (meta.orientation ?? 1) >= 5;
  const source = { width: (rotated ? meta.height : meta.width) ?? 0, height: (rotated ? meta.width : meta.height) ?? 0 };
  if (source.width < 16 || source.height < 16) throw new PosterRenderError('The photo is too small to use.');

  const photoRect = fitInside(source, layout.photo);
  const t = TREATMENTS[design.photoTreatment];

  let pipeline = sharp(input.photo, { failOn: 'error' }).rotate().resize(photoRect.width, photoRect.height, { fit: 'fill', kernel: 'lanczos3' });
  if (t.brightness !== 1 || t.saturation !== 1) pipeline = pipeline.modulate({ brightness: t.brightness, saturation: t.saturation });
  if (t.contrast !== 1) pipeline = pipeline.linear(t.contrast, 128 * (1 - t.contrast));
  const radius = Math.min(layout.radius, Math.floor(Math.min(photoRect.width, photoRect.height) / 2));
  let photo: Buffer;
  try {
    photo = await pipeline
      .ensureAlpha()
      .composite([{ input: roundedMask(photoRect.width, photoRect.height, radius), blend: 'dest-in' }])
      .png()
      .toBuffer();
  } catch {
    throw new PosterRenderError('The photo could not be processed. Please try another photo.');
  }

  const shadow = shadowSvg(photoRect, radius);
  const layers: sharp.OverlayOptions[] = [
    { input: shadow, left: 0, top: 0 },
    { input: photo, left: photoRect.x, top: photoRect.y },
    { input: overlaySvg(design, layout, input), left: 0, top: 0 },
  ];
  const buffer = await sharp(backgroundSvg(design))
    .composite(layers)
    .flatten({ background: design.backgroundColor })
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return { buffer, layout, photoRect };
}
