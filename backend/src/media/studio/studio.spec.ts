import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { profileFor } from './enhance-profiles';
import { assess, measure } from './image-quality';
import { checkOutput } from './output-checks';
import { enhance } from './sharp-pipeline';

const FIXTURES = join(__dirname, '../../../test/fixtures/images');

interface Scene {
  width?: number;
  height?: number;
  background?: string;
  product?: string;
  /** Product box as fractions of the frame. */
  box?: [number, number, number, number];
  shape?: 'ellipse' | 'rect';
  noisyBackground?: boolean;
  /** Stains close beside the product, inside the area that ends up in the framed result. */
  ringStains?: boolean;
  blur?: number;
  brightness?: number;
}

/** A product-like object with stripes and a stitch line, so sharpness and detail can be measured. */
async function scene(s: Scene = {}): Promise<Buffer> {
  const width = s.width ?? 1200;
  const height = s.height ?? 1200;
  const [fx, fy, fw, fh] = s.box ?? [0.25, 0.25, 0.5, 0.5];
  const x = Math.round(width * fx);
  const y = Math.round(height * fy);
  const w = Math.round(width * fw);
  const h = Math.round(height * fh);
  const product = s.product ?? '#a0522d';
  const body = s.shape === 'rect' ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="${product}"/>` : `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${product}"/>`;
  const stripes = Array.from({ length: 8 }, (_, i) => `<rect x="${x + (w * (i + 1)) / 10}" y="${y + h * 0.3}" width="${w / 40}" height="${h * 0.4}" fill="#ffffff" opacity="0.55"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}<g clip-path="inset(0)">${stripes}</g></svg>`;
  let image = sharp({ create: { width, height, channels: 3, background: s.background ?? '#e8e8e8' } }).composite([{ input: Buffer.from(svg) }]);
  let buffer = await image.png().toBuffer();
  if (s.noisyBackground || s.ringStains) {
    const blotches = s.ringStains
      ? [[333, 450], [333, 750], [867, 450], [867, 750]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="20" fill="#444444" opacity="0.8"/>`).join('')
      : Array.from({ length: 24 }, (_, i) => {
          const edge = i % 4;
          const along = ((i * 137) % 1000) + 100;
          const cx = edge === 0 ? 20 : edge === 1 ? width - 20 : along;
          const cy = edge === 2 ? 20 : edge === 3 ? height - 20 : along;
          return `<circle cx="${cx}" cy="${cy}" r="${40 + (i % 4) * 15}" fill="#${i % 2 ? '444444' : 'ffffff'}" opacity="0.7"/>`;
        }).join('');
    const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${blotches}</svg>`;
    // Stains go under the product: composite them first, then the product again.
    image = sharp({ create: { width, height, channels: 3, background: s.background ?? '#e8e8e8' } }).composite([{ input: Buffer.from(overlay) }, { input: Buffer.from(svg) }]);
    buffer = await image.png().toBuffer();
  }
  let out = sharp(buffer);
  if (s.blur) out = out.blur(s.blur);
  if (s.brightness) out = out.linear(s.brightness, 0);
  return out.jpeg({ quality: 92 }).toBuffer();
}

async function run(input: Buffer, category: string, mode: 'quick' | 'clean' = 'quick', format: 'portrait' | 'square' = 'portrait') {
  const metrics = await measure(input);
  const { buffer, report } = await enhance(input, metrics, { profile: profileFor(category).profile, format, cleanBackground: mode === 'clean' });
  const check = await checkOutput(input, buffer, format);
  return { metrics, buffer, report, check, assessment: assess(metrics) };
}

describe('Photo Studio', () => {
  describe('quality assessment (Stage A)', () => {
    it('flags poor lighting', async () => {
      const a = assess(await measure(await scene({ brightness: 0.25 })));
      expect(a.problems).toContain('too_dark');
      expect(a.verdict).not.toBe('good');
    });

    it('flags a dirty background', async () => {
      const a = assess(await measure(await scene({ noisyBackground: true })));
      expect(a.problems).toContain('busy_background');
    });

    it('flags a blurry photo', async () => {
      const a = assess(await measure(await scene({ blur: 14 })));
      expect(a.problems.some((p) => p === 'very_blurry' || p === 'slightly_blurry')).toBe(true);
    });

    it('asks for a re-upload when resolution is too low', async () => {
      const a = assess(await measure(await scene({ width: 320, height: 320 })));
      expect(a.problems).toContain('low_resolution');
      expect(a.verdict).toBe('reupload');
    });

    it('asks for a re-upload when the product is cut off on two sides', async () => {
      const a = assess(await measure(await scene({ box: [-0.1, 0.3, 1.2, 0.4], shape: 'rect' })));
      expect(a.problems).toContain('product_cut_off');
      expect(a.verdict).toBe('reupload');
    });

    it('cannot separate a white product from a white background and says so', async () => {
      const m = await measure(await scene({ background: '#f4f4f4', product: '#efefef' }));
      expect(m.product.detected).toBe(false);
    });
  });

  describe('enhancement (Stages B and E)', () => {
    const cases: Array<[string, Scene, string]> = [
      ['a dark product', { background: '#e0e0e0', product: '#1c1c1c' }, 'accessories'],
      ['clothing', { product: '#2f5d8a', shape: 'rect', box: [0.2, 0.15, 0.6, 0.7] }, 'clothing'],
      ['jewellery', { product: '#d4af37', box: [0.38, 0.38, 0.24, 0.24] }, 'jewellery'],
    ];

    it.each(cases)('produces a valid 1080x1350 image for %s', async (_name, sceneOptions, category) => {
      const { buffer, check } = await run(await scene(sceneOptions), category);
      const meta = await sharp(buffer).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 1350]);
      expect(check.errors).toEqual([]);
    });

    it('outputs a 1080x1080 square when asked', async () => {
      const { buffer, check } = await run(await scene(), 'general', 'quick', 'square');
      expect((await sharp(buffer).metadata()).height).toBe(1080);
      expect(check.errors).toEqual([]);
    });

    it('keeps the product whole and does not shrink it to a speck', async () => {
      const { buffer } = await run(await scene({ box: [0.4, 0.4, 0.2, 0.2] }), 'general');
      const after = await measure(buffer);
      expect(after.product.detected).toBe(true);
      expect(after.product.touchesEdges).toEqual([]);
      expect(after.product.areaRatio).toBeGreaterThan(0.1);
    });

    it('does not change the product colour', async () => {
      const input = await scene({ product: '#a0522d', noisyBackground: true });
      const { check } = await run(input, 'footwear', 'clean');
      expect(check.warnings.filter((w) => w.includes('colour'))).toEqual([]);
    });

    it('evens out a stained background without touching the product', async () => {
      const layout: Scene = { shape: 'rect', box: [0.3, 0.3, 0.4, 0.4] };
      const clean = await run(await scene({ ...layout, ringStains: true }), 'general', 'clean');
      const quick = await run(await scene({ ...layout, ringStains: true }), 'general', 'quick');
      const ideal = await run(await scene(layout), 'general', 'quick');
      expect(clean.report.backgroundCleaned).toBe(true);
      const distance = async (a: Buffer, b: Buffer) => {
        const [x, y] = await Promise.all([sharp(a).raw().toBuffer(), sharp(b).raw().toBuffer()]);
        return x.reduce((sum, v, i) => sum + Math.abs(v - y[i]!), 0) / x.length;
      };
      // Cleaned output is closer to a photo that never had stains than the un-cleaned output is.
      expect(await distance(clean.buffer, ideal.buffer)).toBeLessThan(await distance(quick.buffer, ideal.buffer));
      expect(clean.check.errors).toEqual([]);
    });

    it('leaves the background alone, and says why, when the product cannot be separated', async () => {
      const { report } = await run(await scene({ background: '#f4f4f4', product: '#efefef' }), 'general', 'clean');
      expect(report.backgroundCleaned).toBe(false);
      expect(report.backgroundSkippedReason).toBeTruthy();
    });

    it('is deterministic: the same photo and settings give identical bytes', async () => {
      const input = await scene();
      expect((await run(input, 'general')).buffer.equals((await run(input, 'general')).buffer)).toBe(true);
    });
  });

  describe('output checks', () => {
    it('rejects a blank result', async () => {
      const input = await scene();
      const blank = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
      expect((await checkOutput(input, blank, 'portrait')).errors).toContain('The result looks blank.');
    });

    it('rejects the wrong dimensions', async () => {
      const input = await scene();
      const wrong = await sharp(input).resize(800, 800).jpeg().toBuffer();
      expect((await checkOutput(input, wrong, 'portrait')).errors.length).toBeGreaterThan(0);
    });

    it('warns when the product colour changed', async () => {
      const input = await scene({ product: '#a0522d' });
      const recoloured = await scene({ product: '#2d52a0', width: 1080, height: 1350, box: [0.25, 0.3, 0.5, 0.4] });
      const check = await checkOutput(input, recoloured, 'portrait');
      expect(check.errors).toEqual([]);
      expect(check.warnings.join(' ')).toContain('colour');
    });
  });

  describe('real sandal photos', () => {
    it('sandal-2 touches the right edge and would need about a third blank canvas, which the service refuses', async () => {
      const { metrics, report } = await run(readFileSync(join(FIXTURES, 'sandal-2.jpg')), 'footwear', 'clean');
      expect(metrics.product.touchesEdges).toContain('right');
      expect((report.extended.left + report.extended.right) / report.crop.width).toBeGreaterThan(0.12);
    });

    it.each(['sandal-1.jpg', 'sandal-2.jpg', 'sandal-3.jpg'])('%s: enhances to a valid, publishable image or asks for a re-upload', async (file) => {
      const input = readFileSync(join(FIXTURES, file));
      const { assessment, buffer, check } = await run(input, 'footwear', 'quick');
      expect(assessment.verdict).toMatch(/good|enhance|reupload/);
      expect(check.errors).toEqual([]);
      expect(buffer.length).toBeLessThan(8 * 1024 * 1024);
      const clean = await run(input, 'footwear', 'clean');
      expect(clean.check.errors).toEqual([]);
      expect(clean.check.warnings.filter((w) => w.includes('colour'))).toEqual([]);
    });
  });
});
