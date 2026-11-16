import sharp from 'sharp';
import { FORMATS, type InstagramFormat } from './enhance-profiles';
import { borderStats, findProduct, measure, workingCopy } from './image-quality';

/** Instagram rejects feed images over 8 MB. */
const MAX_PUBLISH_BYTES = 8 * 1024 * 1024;

export interface OutputCheck {
  /** Blocking problems: the image must not be stored or published. */
  errors: string[];
  /** The image is usable but the owner should look at it before approving. */
  warnings: string[];
  /** How far the product's colour moved from the original (largest change in any channel's share, 0 = identical). Null when it could not be measured. */
  colourShift?: number | null;
}

/** Share of each colour channel in the product's mean colour. Unaffected by brightness, so exposure changes don't count. */
async function productChroma(input: Buffer): Promise<[number, number, number] | null> {
  const img = await workingCopy(input);
  const { colour, variation } = borderStats(img);
  const { region, mask } = findProduct(img, colour, variation);
  if (!region.detected) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    r += img.data[p * 3]!;
    g += img.data[p * 3 + 1]!;
    b += img.data[p * 3 + 2]!;
    n++;
  }
  const total = r + g + b;
  return n === 0 || total === 0 ? null : [r / total, g / total, b / total];
}

/**
 * Checks a finished image before it is stored or published: size, format, ratio, not blank, product still
 * visible and not newly cut off, and product colour unchanged. Pure measurement on the actual pixels.
 */
export async function checkOutput(original: Buffer, output: Buffer, format: InstagramFormat, opts: { sceneReplaced?: boolean } = {}): Promise<OutputCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const canvas = FORMATS[format];

  const meta = await sharp(output).metadata();
  if (meta.format !== 'jpeg') errors.push('The result is not a JPEG image.');
  if (meta.width !== canvas.width || meta.height !== canvas.height) errors.push(`The result is ${meta.width}x${meta.height}, expected ${canvas.width}x${canvas.height}.`);
  if (output.length > MAX_PUBLISH_BYTES) errors.push('The result is larger than the 8 MB Instagram limit.');
  if (errors.length) return { errors, warnings };

  const stats = await sharp(output).stats();
  const spread = stats.channels.reduce((s, c) => s + c.stdev, 0) / stats.channels.length;
  if (spread < 3) {
    errors.push('The result looks blank.');
    return { errors, warnings };
  }

  const before = await measure(original);
  const after = await measure(output);
  // A generated scene has a busy background, which the plain-backdrop product detector cannot always separate,
  // so for scene edits these become warnings and the owner confirms before approving.
  const framing = opts.sceneReplaced ? warnings : errors;
  if (before.product.detected && !after.product.detected) framing.push(opts.sceneReplaced ? 'Please check that the whole product is still clearly visible.' : 'The product is no longer visible in the result.');
  const newlyCut = after.product.touchesEdges.filter((e) => !before.product.touchesEdges.includes(e));
  if (after.product.detected && newlyCut.length > 0) framing.push(opts.sceneReplaced ? 'The product may be cut off at the edge. Please check before approving.' : 'The product is cut off at the edge of the result.');
  if (errors.length) return { errors, warnings };

  const a = await productChroma(original);
  const b = await productChroma(output);
  let colourShift: number | null = null;
  if (a && b) {
    colourShift = Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
    if (colourShift > 0.04) warnings.push('The product colour looks different from the original. Please compare before approving.');
  }
  return { errors, warnings, colourShift };
}
