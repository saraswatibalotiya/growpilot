import sharp from 'sharp';
import { bodyLayer, brandLayer, priceLayer, titleLayer, type TextLook } from './typography';

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  let dark = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 200) continue;
    opaque++;
    const lum = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    if (lum > 225) white++;
    if (lum < 70) dark++;
  }
  return { white, dark, opaque, total: info.width * info.height };
}

const look = (over: Partial<TextLook> = {}): TextLook => ({ ink: '#1B1B1B', sub: '#555555', accent: '#A8812F', behind: [235, 235, 235], style: 'MODERN', language: 'en', ...over });

describe('text over a photo (AI scenes)', () => {
  it('is white with no backing box, however light the photo is behind it', async () => {
    for (const layer of [brandLayer, titleLayer, bodyLayer, priceLayer]) {
      const out = await layer('Strappy sandals', 400, look({ overPhoto: true, behind: [226, 220, 214] }), 0.4);
      const p = await pixels(out.png);
      expect(p.white).toBeGreaterThan(150); // the letters
      expect(p.dark / Math.max(p.opaque, 1)).toBeLessThan(0.05); // no dark plate behind them
    }
  });

  it('records the contrast it really measured against the faded background, not an invented number', async () => {
    const dark = await titleLayer('Strappy sandals', 400, look({ overPhoto: true, behind: [30, 30, 36] }), 0.4);
    const light = await titleLayer('Strappy sandals', 400, look({ overPhoto: true, behind: [235, 235, 235] }), 0.4);
    expect(dark.contrast).toBeGreaterThan(10);
    expect(light.contrast).toBeLessThan(2);
  });

  it('keeps the price white too, instead of using an accent colour that can vanish on the product', async () => {
    const out = await priceLayer('₹699', 1230, look({ overPhoto: true, accent: '#C62828', behind: [120, 100, 90] }), 0.3);
    const p = await pixels(out.png);
    expect(p.white).toBeGreaterThan(300);
  });
});

describe('text on a plain studio backdrop is unchanged', () => {
  it('uses dark ink on a light backdrop', async () => {
    const out = await titleLayer('Strappy sandals', 400, look({ behind: [245, 245, 245] }), 0.4);
    const p = await pixels(out.png);
    expect(p.dark).toBeGreaterThan(300);
    expect(p.white).toBeLessThan(p.dark);
  });

  it('uses light ink on a dark backdrop', async () => {
    const out = await titleLayer('Strappy sandals', 400, look({ ink: '#F7EFE4', behind: [20, 16, 14] }), 0.4);
    const p = await pixels(out.png);
    expect(p.white).toBeGreaterThan(300);
  });
});

