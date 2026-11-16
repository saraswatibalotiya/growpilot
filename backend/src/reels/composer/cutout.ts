import sharp from 'sharp';
import { borderStats, workingCopy } from '../../media/studio/image-quality';
import { ReelUserError } from '../reel-user-error';

/** The product on a transparent canvas. RGB pixels are the original photo's; only transparency is added. */
export interface ProductCutout {
  png: Buffer;
  width: number;
  height: number;
  /** True when the background was removed; false when the whole photo is used with feathered edges. */
  isolated: boolean;
  /** Share of the cutout canvas that is product (opaque). */
  coverage: number;
}

const MAX_SIDE = 1600;
const WORK = 420;

/**
 * Background removal for product photos shot on a plain backdrop. A pixel is background when its colour is close to
 * the border colour AND it is connected to the border, so light parts inside the product (straps, labels) are never
 * removed. Busy backgrounds, or a result that looks wrong, fall back to the whole photo with soft edges.
 */
export async function cutoutProduct(image: Buffer): Promise<ProductCutout> {
  let base: { data: Buffer; info: sharp.OutputInfo };
  try {
    base = await sharp(image, { failOn: 'error' }).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).removeAlpha().png().toBuffer({ resolveWithObject: true });
  } catch {
    throw new ReelUserError('The product photo could not be read. Please choose another photo.');
  }
  const { width, height } = base.info;
  if (width < 16 || height < 16) throw new ReelUserError('The product photo could not be read. Please choose another photo.');

  const work = await workingCopy(base.data, WORK);
  const { colour, variation } = borderStats(work, 0.03);
  if (variation > 24) return feathered(base.data, width, height);

  const total = work.width * work.height;
  const threshold = Math.min(70, Math.max(26, 20 + variation * 2.2));
  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const near = (p: number) => {
    const i = p * 3;
    return Math.hypot(work.data[i]! - colour[0], work.data[i + 1]! - colour[1], work.data[i + 2]! - colour[2]) < threshold;
  };
  const seed = (p: number) => {
    if (!background[p] && near(p)) {
      background[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < work.width; x++) {
    seed(x);
    seed((work.height - 1) * work.width + x);
  }
  for (let y = 0; y < work.height; y++) {
    seed(y * work.width);
    seed(y * work.width + work.width - 1);
  }
  while (head < tail) {
    const p = queue[head++]!;
    const x = p % work.width;
    if (x > 0) seed(p - 1);
    if (x < work.width - 1) seed(p + 1);
    if (p >= work.width) seed(p - work.width);
    if (p < total - work.width) seed(p + work.width);
  }

  const product = keepMainParts(background, work.width, work.height);
  let count = 0;
  let minX = work.width;
  let minY = work.height;
  let maxX = -1;
  let maxY = -1;
  for (let p = 0; p < total; p++) {
    if (!product[p]) continue;
    count++;
    const x = p % work.width;
    const y = (p - x) / work.width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const ratio = count / total;
  if (ratio < 0.03 || ratio > 0.9 || maxX < 0) return feathered(base.data, width, height);

  // Upscale and soften the mask. The edge sits on the product boundary, so nothing of the product is clipped.
  const alphaWork = Buffer.alloc(total);
  for (let p = 0; p < total; p++) if (product[p]) alphaWork[p] = 255;
  const alpha = await sharp(alphaWork, { raw: { width: work.width, height: work.height, channels: 1 } })
    .resize(width, height, { kernel: 'cubic' })
    .blur(1.2)
    // Steepen the soft edge, biased slightly inward to drop the backdrop-coloured fringe; 0 stays 0 and 255 stays 255.
    .linear(1.6, -100)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const sx = width / work.width;
  const sy = height / work.height;
  const pad = Math.round(Math.max(width, height) * 0.01);
  const left = Math.max(0, Math.floor(minX * sx) - pad);
  const top = Math.max(0, Math.floor(minY * sy) - pad);
  const right = Math.min(width, Math.ceil((maxX + 1) * sx) + pad);
  const bottom = Math.min(height, Math.ceil((maxY + 1) * sy) + pad);
  // Two steps: sharp would otherwise crop before joining the full-size alpha channel.
  const withAlpha = await sharp(base.data).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const png = await sharp(withAlpha).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
  const cutArea = ((right - left) * (bottom - top)) / (sx * sy);
  return { png, width: right - left, height: bottom - top, isolated: true, coverage: Math.min(1, count / cutArea) };
}

/** Product = everything that is not background, minus specks far smaller than the main parts. */
function keepMainParts(background: Uint8Array, width: number, height: number): Uint8Array {
  const total = width * height;
  const labels = new Int32Array(total).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (background[start] || labels[start] !== -1) continue;
    const label = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    while (top > 0) {
      const p = stack[--top]!;
      size++;
      const x = p % width;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
      for (const q of next) {
        if (q < 0 || q >= total || background[q] || labels[q] !== -1) continue;
        labels[q] = label;
        stack[top++] = q;
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  const keep = sizes.map((s) => s >= Math.max(largest * 0.12, total * 0.002));
  const out = new Uint8Array(total);
  for (let p = 0; p < total; p++) if (labels[p]! >= 0 && keep[labels[p]!]) out[p] = 1;
  return out;
}

/** The whole photo with soft, feathered edges so it melts into the studio backdrop. No border, no card. */
async function feathered(photo: Buffer, width: number, height: number): Promise<ProductCutout> {
  const f = Math.round(Math.min(width, height) * 0.06);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="b"><feGaussianBlur stdDeviation="${f / 2}"/></filter></defs>` +
      `<rect x="${f}" y="${f}" width="${width - 2 * f}" height="${height - 2 * f}" rx="${f * 1.5}" fill="#fff" filter="url(#b)"/></svg>`,
  );
  const png = await sharp(photo).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return { png, width, height, isolated: false, coverage: 1 };
}

/** The product with a natural drop shadow, a contact shadow and (on glossy floors) a faint reflection. */
export interface ProductStage {
  png: Buffer;
  width: number;
  height: number;
  /** Size of the product itself inside the stage. */
  productWidth: number;
  productHeight: number;
}

/** Longest product side on the stage, in pixels. Scenes scale the stage down, never far up, so it stays sharp. */
const STAGE_PRODUCT = { w: 1000, h: 1100 };

export async function buildStage(cut: ProductCutout, opts: { reflection: boolean; dark: boolean }): Promise<ProductStage> {
  const meta = await sharp(cut.png).metadata();
  if (meta.width !== cut.width || meta.height !== cut.height) throw new Error('product cutout size mismatch');
  const fit = Math.min(STAGE_PRODUCT.w / cut.width, STAGE_PRODUCT.h / cut.height);
  const pw = Math.max(2, Math.round(cut.width * fit));
  const ph = Math.max(2, Math.round(cut.height * fit));
  const product = await sharp(cut.png).resize(pw, ph, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const pad = Math.round(pw * 0.08);
  const reflectH = opts.reflection && cut.isolated ? Math.round(ph * 0.22) : 0;
  const shadowH = Math.round(ph * 0.08);
  const sw = pw + pad * 2;
  const sh = pad + ph + Math.max(reflectH, shadowH) + pad;
  const layers: sharp.OverlayOptions[] = [];

  if (cut.isolated) {
    // Contact shadow: a soft ellipse where the product meets the floor.
    const contact = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(pw * 0.03)}"/></filter></defs>` +
        `<ellipse cx="${sw / 2}" cy="${pad + ph - ph * 0.01}" rx="${pw * 0.42}" ry="${Math.max(6, ph * 0.035)}" fill="#000" fill-opacity="${opts.dark ? 0.6 : 0.32}" filter="url(#b)"/></svg>`,
    );
    layers.push({ input: contact, left: 0, top: 0 });
    // Drop shadow: the product's own silhouette, darkened, blurred and nudged down.
    const shadowAlpha = await sharp(product).ensureAlpha().extractChannel(3).linear(opts.dark ? 0.5 : 0.22, 0).raw().toBuffer();
    const silhouette = await sharp({ create: { width: pw, height: ph, channels: 3, background: '#000' } })
      .joinChannel(shadowAlpha, { raw: { width: pw, height: ph, channels: 1 } })
      .png()
      .toBuffer()
      .then((b) => sharp(b).blur(Math.max(1, pw * 0.02)).png().toBuffer());
    layers.push({ input: silhouette, left: pad, top: pad + Math.round(ph * 0.025) });
    if (reflectH) {
      const fade = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${opts.dark ? 0.22 : 0.16}"/><stop offset="0.22" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="${pw}" height="${ph}" fill="url(#f)"/></svg>`,
      );
      const reflection = await sharp(product).flip().ensureAlpha().composite([{ input: fade, blend: 'dest-in' }]).png().toBuffer();
      const cropped = await sharp(reflection).extract({ left: 0, top: 0, width: pw, height: reflectH }).png().toBuffer();
      layers.push({ input: cropped, left: pad, top: pad + ph + 2 });
    }
  }
  layers.push({ input: product, left: pad, top: pad });
  const png = await sharp({ create: { width: sw, height: sh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer();
  return { png, width: sw, height: sh, productWidth: pw, productHeight: ph };
}
