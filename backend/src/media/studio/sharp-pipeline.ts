import sharp from 'sharp';
import { FORMATS, type EnhanceProfile, type InstagramFormat } from './enhance-profiles';
import { borderStats, findProduct, type Box, type ImageMetrics, type Rgb, workingCopy } from './image-quality';

export interface EnhanceOptions {
  profile: EnhanceProfile;
  format: InstagramFormat;
  /** Even out the backdrop (stains, shadows from clutter) while leaving product pixels untouched. */
  cleanBackground: boolean;
  /** Keep the whole photo and fill the spare canvas with a blurred copy, instead of cropping or extending. */
  blurFit?: boolean;
}

export interface EnhanceReport {
  whiteBalanceGains: Rgb;
  exposureGain: number;
  contrast: number;
  saturation: number;
  denoised: boolean;
  backgroundCleaned: boolean;
  /** Why background cleanup was skipped, when it was requested. */
  backgroundSkippedReason: string | null;
  crop: Box;
  /** Pixels added beyond the original photo on each side, filled with the backdrop colour. */
  extended: { top: number; bottom: number; left: number; right: number };
  output: { width: number; height: number; bytes: number; format: 'jpeg' };
}

export interface EnhanceResult {
  buffer: Buffer;
  report: EnhanceReport;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const luminance = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** White balance from the backdrop (assumed neutral) and exposure aimed at a bright backdrop, both capped. */
function corrections(background: Rgb, profile: EnhanceProfile): { gains: Rgb; exposure: number } {
  const grey = (background[0] + background[1] + background[2]) / 3;
  const wb = background.map((c) => clamp(grey / Math.max(1, c), 1 - profile.maxWhiteBalance, 1 + profile.maxWhiteBalance)) as Rgb;
  const balanced: Rgb = [background[0] * wb[0], background[1] * wb[1], background[2] * wb[2]];
  // Never darken a bright backdrop, and never push it past the target: product highlights must not clip.
  const exposure = clamp(profile.targetBackground / Math.max(1, luminance(balanced)), 1, profile.maxExposureGain);
  return { gains: wb, exposure };
}

/**
 * The crop that frames the product on a canvas of the target aspect ratio, filling `fill` of the limiting side.
 * It may extend past the photo; those parts are later filled with the backdrop colour. A side the product already
 * touches is kept flush with the photo edge, so a cut-off product never gets a fake strip of backdrop beside it.
 */
function frameCrop(product: Box, image: { width: number; height: number }, aspect: number, fill: number, flush: Array<'top' | 'bottom' | 'left' | 'right'>): Box {
  const height = Math.max(product.height / fill, product.width / (fill * aspect));
  const width = height * aspect;
  let left = product.left + product.width / 2 - width / 2;
  let top = product.top + product.height / 2 - height / 2;
  if (flush.includes('left')) left = Math.max(left, 0);
  if (flush.includes('right')) left = Math.min(left, image.width - width);
  if (flush.includes('top')) top = Math.max(top, 0);
  if (flush.includes('bottom')) top = Math.min(top, image.height - height);
  return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
}

/**
 * Feathered alpha (0..255, full resolution): 255 on the product and a margin around it (so contact shadows stay),
 * fading to 0 on the backdrop. Interior holes (light stitching, gaps between straps) are filled.
 */
async function productAlpha(input: Buffer, width: number, height: number, background: Rgb, variation: number): Promise<Buffer | null> {
  const img = await workingCopy(input);
  const { region, mask } = findProduct(img, background, variation);
  if (!region.detected || region.separation < 40) return null;
  const w = img.width;
  const h = img.height;
  // Fill holes: anything not reachable from the border through backdrop pixels belongs to the product.
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (outside[p] || mask[p]) continue;
    outside[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
  const filled = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) filled[p] = outside[p] ? 0 : 1;
  const margin = 1;
  // Our own dilation: sharp's dilate/erode are swapped in some libvips builds.
  const grown = growMask(filled, w, h, margin);
  return sharp(Buffer.from(grown.map((v) => v * 255)), { raw: { width: w, height: h, channels: 1 } })
    .blur(0.6)
    .resize(width, height, { kernel: 'cubic' })
    .extractChannel(0)
    .raw()
    .toBuffer();
}

/** Grows a 0/1 mask by `radius` pixels (square neighbourhood), via two separable 1-D passes. */
function growMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let last = -Infinity;
    for (let x = 0; x < width; x++) if (mask[y * width + x]) last = x; else if (x - last <= radius) horizontal[y * width + x] = 1;
    last = Infinity;
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x]) { last = x; horizontal[y * width + x] = 1; } else if (last - x <= radius) horizontal[y * width + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let last = -Infinity;
    for (let y = 0; y < height; y++) if (horizontal[y * width + x]) { last = y; out[y * width + x] = 1; } else if (y - last <= radius) out[y * width + x] = 1;
    last = Infinity;
    for (let y = height - 1; y >= 0; y--) if (horizontal[y * width + x]) last = y; else if (last - y <= radius) out[y * width + x] = 1;
  }
  return out;
}

/** Stage B + E: deterministic enhancement and Instagram framing. No AI, no network. */
export async function enhance(input: Buffer, metrics: ImageMetrics, options: EnhanceOptions): Promise<EnhanceResult> {
  const { profile } = options;
  const canvas = FORMATS[options.format];
  const work = await workingCopy(input);
  const { colour: background, variation } = borderStats(work);
  const { gains, exposure } = corrections(background, profile);
  const c = profile.contrast;
  const a = gains.map((g) => g * exposure * (1 + c));
  const b = [-128 * c, -128 * c, -128 * c];
  const denoised = metrics.brightness < 90;

  let base = sharp(input).rotate().removeAlpha().toColourspace('srgb');
  if (denoised) base = base.median(3);
  const corrected = await base.linear(a, b).toBuffer();
  const meta = await sharp(corrected).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const correctedBackground: Rgb = background.map((v, i) => clamp(Math.round(v * a[i]! + b[i]!), 0, 255)) as Rgb;

  let working = corrected;
  let backgroundCleaned = false;
  let backgroundSkippedReason: string | null = null;
  if (options.cleanBackground) {
    const alpha = await productAlpha(input, width, height, background, variation);
    if (!alpha) {
      backgroundSkippedReason = 'The product could not be cleanly separated from the background, so the background was left as it is.';
    } else {
      const backdrop = await sharp({ create: { width, height, channels: 3, background: { r: correctedBackground[0], g: correctedBackground[1], b: correctedBackground[2] } } })
        .jpeg()
        .toBuffer();
      const cutout = await withAlpha(corrected, alpha, width, height);
      working = await sharp(backdrop).composite([{ input: cutout }]).jpeg({ quality: 95 }).toBuffer();
      backgroundCleaned = true;
    }
  }

  const aspect = canvas.width / canvas.height;
  const product = metrics.product.detected ? metrics.product.box : { left: 0, top: 0, width, height };
  const fill = metrics.product.detected ? profile.productFill : 1;
  const crop = options.blurFit ? { left: 0, top: 0, width, height } : frameCrop(product, { width, height }, aspect, fill, metrics.product.detected ? metrics.product.touchesEdges : []);
  const inside = {
    left: clamp(crop.left, 0, width - 1),
    top: clamp(crop.top, 0, height - 1),
  };
  const right = Math.min(width, crop.left + crop.width);
  const bottom = Math.min(height, crop.top + crop.height);
  const extract = { left: inside.left, top: inside.top, width: right - inside.left, height: bottom - inside.top };
  const extended = {
    left: inside.left - crop.left,
    top: inside.top - crop.top,
    right: crop.left + crop.width - right,
    bottom: crop.top + crop.height - bottom,
  };
  const framed = options.blurFit ? await blurFit(working, canvas) : await extendSeamlessly(await sharp(working).extract(extract).toBuffer(), extended);
  const buffer = await sharp(framed)
    .resize(canvas.width, canvas.height, { fit: 'fill', kernel: 'lanczos3' })
    .modulate({ saturation: profile.saturation })
    .sharpen({ sigma: profile.sharpenSigma, m1: 0.6, m2: 1.2 })
    .toColourspace('srgb')
    .jpeg({ quality: 90, mozjpeg: true, progressive: true })
    .toBuffer();

  return {
    buffer,
    report: {
      whiteBalanceGains: gains.map((g) => Number(g.toFixed(3))) as Rgb,
      exposureGain: Number(exposure.toFixed(3)),
      contrast: c,
      saturation: profile.saturation,
      denoised,
      backgroundCleaned,
      backgroundSkippedReason,
      crop,
      extended,
      output: { width: canvas.width, height: canvas.height, bytes: buffer.length, format: 'jpeg' },
    },
  };
}

/** The whole photo, uncropped, centred over a blurred, enlarged copy of itself. */
async function blurFit(image: Buffer, canvas: { width: number; height: number }): Promise<Buffer> {
  const backdrop = await sharp(image).resize(canvas.width, canvas.height, { fit: 'cover' }).blur(40).modulate({ brightness: 1.2, saturation: 0.5 }).toBuffer();
  const photo = await sharp(image).resize(canvas.width, canvas.height, { fit: 'inside' }).toBuffer();
  return sharp(backdrop).composite([{ input: photo, gravity: 'centre' }]).jpeg({ quality: 95 }).toBuffer();
}

/** RGBA PNG from an image and a 1-channel alpha, built from raw pixels (joinChannel with raw input is unreliable). */
async function withAlpha(image: Buffer, alpha: Buffer, width: number, height: number): Promise<Buffer> {
  const rgb = await sharp(image).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba[p * 4] = rgb[p * 3]!;
    rgba[p * 4 + 1] = rgb[p * 3 + 1]!;
    rgba[p * 4 + 2] = rgb[p * 3 + 2]!;
    rgba[p * 4 + 3] = alpha[p]!;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * Adds canvas around a photo by continuing its own edge pixels, then softens only the added strips, so the backdrop
 * carries on without a seam. A flat colour would leave a visible band wherever the photo's edge is shaded.
 */
async function extendSeamlessly(image: Buffer, sides: { top: number; bottom: number; left: number; right: number }): Promise<Buffer> {
  if (sides.top + sides.bottom + sides.left + sides.right === 0) return image;
  const copied = await sharp(image).extend({ ...sides, extendWith: 'copy' }).toBuffer();
  const { width, height } = await sharp(copied).metadata();
  const radius = Math.max(4, Math.round(Math.max(sides.left, sides.right, sides.top, sides.bottom) / 3));
  const soft = await sharp(copied).blur(radius).toBuffer();
  const strips: Array<{ left: number; top: number; width: number; height: number }> = [];
  const add = (left: number, top: number, w: number, h: number) => {
    if (w > 0 && h > 0) strips.push({ left, top, width: w, height: h });
  };
  add(0, 0, sides.left, height!);
  add(width! - sides.right, 0, sides.right, height!);
  add(0, 0, width!, sides.top);
  add(0, height! - sides.bottom, width!, sides.bottom);
  const inputs = await Promise.all(strips.map(async (s) => ({ input: await sharp(soft).extract(s).toBuffer(), left: s.left, top: s.top })));
  return sharp(copied).composite(inputs).toBuffer();
}
