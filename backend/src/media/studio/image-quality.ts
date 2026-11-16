import sharp from 'sharp';

/** Pixels sampled for analysis: the longest side of the working copy. Small enough to be fast, large enough to be stable. */
const WORK_SIZE = 384;
const BLUR_SIZE = 1000;

export type Rgb = [number, number, number];

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ProductRegion {
  /** False when the product cannot be told apart from the background (e.g. white product on white). */
  detected: boolean;
  /** Bounding box in full-resolution, oriented pixels. Whole frame when not detected. */
  box: Box;
  /** Share of the frame covered by product pixels (0..1). */
  areaRatio: number;
  /** Sides where the product reaches the frame edge, i.e. it may be cut off. */
  touchesEdges: Array<'top' | 'bottom' | 'left' | 'right'>;
  /** Mean colour distance between product and background (0..441). Low means poor separation. */
  separation: number;
}

export interface ImageMetrics {
  format: string;
  width: number;
  height: number;
  bytes: number;
  /** EXIF orientation of the source (1 = upright). Width/height are already oriented. */
  orientation: number;
  /** Laplacian variance on a normalised copy: higher is sharper. */
  sharpness: number;
  /** Mean luminance 0..255. */
  brightness: number;
  /** Luminance standard deviation 0..255. */
  contrast: number;
  /** Median colour of the frame border, taken as the background. */
  background: Rgb;
  /** Luminance standard deviation of the border: high means a busy or stained background. */
  backgroundVariation: number;
  /** How far the background is from neutral grey (0 = neutral). Indicates a colour cast. */
  colourCast: number;
  product: ProductRegion;
}

type QualityProblem =
  | 'very_blurry'
  | 'slightly_blurry'
  | 'too_dark'
  | 'too_bright'
  | 'low_contrast'
  | 'colour_cast'
  | 'busy_background'
  | 'too_much_empty_space'
  | 'product_cut_off'
  | 'product_at_edge'
  | 'product_not_separated'
  | 'low_resolution'
  | 'awkward_aspect_ratio';

type QualityAction = 'improve_lighting' | 'correct_white_balance' | 'crop_product' | 'clean_background' | 'reupload';

export interface QualityAssessment {
  metrics: ImageMetrics;
  /** 0..100, deterministic. */
  score: number;
  problems: QualityProblem[];
  actions: QualityAction[];
  /** reupload: don't spend effort (or AI credits) on this photo; ask for another. */
  verdict: 'good' | 'enhance' | 'reupload';
  messages: string[];
}

const MIN_SOURCE_SIDE = 500;

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

/** Upright, sRGB, 3-channel working copy, longest side `size`. */
export async function workingCopy(input: Buffer, size = WORK_SIZE): Promise<Raw> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Median colour and luminance spread of a border band around the frame. */
export function borderStats(img: Raw, band = 0.05): { colour: Rgb; variation: number } {
  const bw = Math.max(2, Math.round(img.width * band));
  const bh = Math.max(2, Math.round(img.height * band));
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const l: number[] = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (x >= bw && x < img.width - bw && y >= bh && y < img.height - bh) continue;
      const i = (y * img.width + x) * 3;
      r.push(img.data[i]!);
      g.push(img.data[i + 1]!);
      b.push(img.data[i + 2]!);
      l.push(luminance(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!));
    }
  }
  return { colour: [median(r), median(g), median(b)], variation: stdev(l) };
}

/**
 * Product pixels: those far enough from the background colour. Returns a 0/1 mask at working size.
 * The threshold adapts to how noisy the background is, so paper texture is not mistaken for product.
 */
function productMask(img: Raw, background: Rgb, variation: number): Uint8Array {
  const threshold = Math.max(30, Math.min(70, variation * 2.5 + 18));
  const mask = new Uint8Array(img.width * img.height);
  for (let p = 0; p < mask.length; p++) {
    const i = p * 3;
    const d = Math.hypot(img.data[i]! - background[0], img.data[i + 1]! - background[1], img.data[i + 2]! - background[2]);
    mask[p] = d > threshold ? 1 : 0;
  }
  return mask;
}

/** 4-connected components of a 0/1 mask, largest first. Labels are written into the returned array (1-based). */
function components(mask: Uint8Array, width: number, height: number): { labels: Int32Array; sizes: Array<{ label: number; size: number; box: Box }> } {
  const labels = new Int32Array(mask.length);
  const sizes: Array<{ label: number; size: number; box: Box }> = [];
  const stack = new Int32Array(mask.length);
  let next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    next += 1;
    let top = 0;
    stack[top++] = start;
    labels[start] = next;
    let size = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    while (top > 0) {
      const p = stack[--top]!;
      size += 1;
      const x = p % width;
      const y = (p - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const n of neighbours) {
        if (n >= 0 && mask[n] && !labels[n]) {
          labels[n] = next;
          stack[top++] = n;
        }
      }
    }
    sizes.push({ label: next, size, box: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 } });
  }
  sizes.sort((a, b) => b.size - a.size);
  return { labels, sizes };
}

/**
 * The product: the largest connected region plus any region at least a fifth of its size (a pair of shoes,
 * a necklace and its pendant). Small specks such as stains on the backdrop are left out.
 */
export function findProduct(img: Raw, background: Rgb, variation: number): { region: Omit<ProductRegion, 'box'> & { workBox: Box }; mask: Uint8Array } {
  const mask = productMask(img, background, variation);
  const { labels, sizes } = components(mask, img.width, img.height);
  const total = img.width * img.height;
  const largest = sizes[0];
  if (!largest || largest.size < total * 0.02) {
    return {
      region: { detected: false, workBox: { left: 0, top: 0, width: img.width, height: img.height }, areaRatio: 0, touchesEdges: [], separation: 0 },
      mask: new Uint8Array(total),
    };
  }
  const kept = sizes.filter((c) => c.size >= Math.max(largest.size * 0.2, total * 0.01));
  const keep = new Set(kept.map((c) => c.label));
  const productOnly = new Uint8Array(total);
  let minX = img.width, minY = img.height, maxX = 0, maxY = 0, count = 0, dist = 0;
  for (let p = 0; p < total; p++) {
    if (!keep.has(labels[p]!)) continue;
    productOnly[p] = 1;
    count += 1;
    const x = p % img.width;
    const y = (p - x) / img.width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const i = p * 3;
    dist += Math.hypot(img.data[i]! - background[0], img.data[i + 1]! - background[1], img.data[i + 2]! - background[2]);
  }
  const edgeX = Math.max(1, Math.round(img.width * 0.015));
  const edgeY = Math.max(1, Math.round(img.height * 0.015));
  const touchesEdges: ProductRegion['touchesEdges'] = [];
  if (minY < edgeY) touchesEdges.push('top');
  if (maxY >= img.height - edgeY) touchesEdges.push('bottom');
  if (minX < edgeX) touchesEdges.push('left');
  if (maxX >= img.width - edgeX) touchesEdges.push('right');
  return {
    region: {
      detected: true,
      workBox: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      areaRatio: count / total,
      touchesEdges,
      separation: dist / count,
    },
    mask: productOnly,
  };
}

/** Variance of the Laplacian on a grey copy normalised to BLUR_SIZE px: the standard focus measure. */
async function sharpnessOf(input: Buffer): Promise<number> {
  const { data } = await sharp(input)
    .rotate()
    .resize({ width: BLUR_SIZE, height: BLUR_SIZE, fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sq = 0;
  for (const v of data) {
    sum += v;
    sq += v * v;
  }
  const mean = sum / data.length;
  return sq / data.length - mean * mean;
}

function scaleBox(box: Box, fromW: number, fromH: number, toW: number, toH: number): Box {
  const sx = toW / fromW;
  const sy = toH / fromH;
  const left = Math.max(0, Math.floor(box.left * sx));
  const top = Math.max(0, Math.floor(box.top * sy));
  return {
    left,
    top,
    width: Math.min(toW - left, Math.ceil(box.width * sx)),
    height: Math.min(toH - top, Math.ceil(box.height * sy)),
  };
}

/** Stage A: measurements only. No AI, no network. */
export async function measure(input: Buffer): Promise<ImageMetrics> {
  const meta = await sharp(input).metadata();
  const orientation = meta.orientation ?? 1;
  const swap = orientation >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  const img = await workingCopy(input);
  const lum: number[] = [];
  for (let p = 0; p < img.width * img.height; p++) {
    const i = p * 3;
    lum.push(luminance(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!));
  }
  const brightness = lum.reduce((s, v) => s + v, 0) / lum.length;
  const { colour, variation } = borderStats(img);
  const grey = (colour[0] + colour[1] + colour[2]) / 3;
  const colourCast = Math.max(...colour.map((c) => Math.abs(c - grey)));
  const { region } = findProduct(img, colour, variation);
  return {
    format: meta.format ?? 'unknown',
    width,
    height,
    bytes: input.length,
    orientation,
    sharpness: await sharpnessOf(input),
    brightness,
    contrast: stdev(lum),
    background: colour,
    backgroundVariation: variation,
    colourCast,
    product: {
      detected: region.detected && region.separation >= 25,
      box: scaleBox(region.workBox, img.width, img.height, width, height),
      areaRatio: region.areaRatio,
      touchesEdges: region.touchesEdges,
      separation: region.separation,
    },
  };
}

/** Stage A verdict from the measurements. Thresholds are calibrated on phone photos of products. */
export function assess(metrics: ImageMetrics): QualityAssessment {
  const problems: QualityProblem[] = [];
  const messages: string[] = [];
  let score = 100;
  const add = (problem: QualityProblem, cost: number, message: string) => {
    problems.push(problem);
    score -= cost;
    messages.push(message);
  };

  if (metrics.sharpness < 20) add('very_blurry', 45, 'The photo is very blurry. Retake it holding the phone steady, in good light.');
  else if (metrics.sharpness < 60) add('slightly_blurry', 10, 'The photo is slightly soft. A steadier shot would look crisper.');
  if (metrics.brightness < 80) add('too_dark', 15, 'The photo is dark.');
  else if (metrics.brightness > 235) add('too_bright', 10, 'The photo is overexposed.');
  if (metrics.contrast < 25) add('low_contrast', 8, 'The photo looks flat.');
  if (metrics.colourCast > 10) add('colour_cast', 6, 'The lighting gives the photo a colour tint.');
  if (metrics.backgroundVariation > 18) add('busy_background', 12, 'The background is uneven or has marks on it.');
  if (metrics.product.detected && metrics.product.areaRatio < 0.3) add('too_much_empty_space', 10, 'The product is small in the frame, with a lot of empty space.');
  if (metrics.product.detected && metrics.product.touchesEdges.length >= 2) {
    add('product_cut_off', 30, 'Part of the product is cut off at the edge of the photo. Step back so the whole product is in the shot.');
  } else if (metrics.product.detected && metrics.product.touchesEdges.length === 1) {
    add('product_at_edge', 8, `The product touches the ${metrics.product.touchesEdges[0]} edge; it can't be given space on that side.`);
  }
  if (!metrics.product.detected) add('product_not_separated', 8, 'The product blends into the background, so it could not be outlined. Edits will be gentle.');
  if (Math.min(metrics.width, metrics.height) < MIN_SOURCE_SIDE) add('low_resolution', 30, `The photo is small (${metrics.width}×${metrics.height}). Use a photo at least ${MIN_SOURCE_SIDE} px on the short side.`);
  const ratio = metrics.width / metrics.height;
  if (ratio < 0.7 || ratio > 1.91) add('awkward_aspect_ratio', 5, 'The photo shape does not fit Instagram; it will be reframed.');

  const actions = new Set<QualityAction>();
  if (problems.some((p) => p === 'too_dark' || p === 'too_bright' || p === 'low_contrast')) actions.add('improve_lighting');
  if (problems.includes('colour_cast')) actions.add('correct_white_balance');
  if (problems.some((p) => p === 'too_much_empty_space' || p === 'awkward_aspect_ratio')) actions.add('crop_product');
  if (problems.includes('busy_background')) actions.add('clean_background');
  const reupload = problems.some((p) => p === 'very_blurry' || p === 'product_cut_off' || p === 'low_resolution');
  if (reupload) actions.add('reupload');

  return {
    metrics,
    score: Math.max(0, Math.round(score)),
    problems,
    actions: [...actions],
    verdict: reupload ? 'reupload' : problems.length === 0 ? 'good' : 'enhance',
    messages,
  };
}
