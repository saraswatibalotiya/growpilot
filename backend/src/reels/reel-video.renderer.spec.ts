import sharp from 'sharp';
import { buildCopy, copyLines, normalise } from './composer/copy';
import { cutoutProduct } from './composer/cutout';
import { audioGraph, musicExpression } from './composer/music';
import { transitionGraph } from './composer/composer';
import { planScenes, sceneLayout } from './composer/scene-plan';
import { contrastRatio, titleLayer } from './composer/typography';
import { probeBuffer } from './media-probe';
import { extractFrame, renderReelVideo } from './reel-video.renderer';
import { SAMPLE_TEXT, sampleScenes, testPhoto } from './reels.test-helpers';

jest.setTimeout(300_000);

const base = (language: 'hi' | 'mr' | 'en' = 'en') => ({ language, productName: SAMPLE_TEXT[language].productName, businessName: SAMPLE_TEXT[language].businessName, priceText: '₹899', offerText: SAMPLE_TEXT[language].offerText });

describe('buildCopy', () => {
  const scenes = (texts: string[]) => texts.map((text, i) => ({ label: `s${i}`, text, startSec: i, endSec: i + 1 }));

  it('gives every scene its own text and never repeats a line', () => {
    const copy = buildCopy({ language: 'en', template: 'NEW_ARRIVALS', productName: 'Cross Chappal', businessName: 'Sukoon Sole', priceText: '₹899', offerText: null, scenes: scenes(['New cross chappal', 'Soft cushioned sole', 'Made for all day', 'Order on WhatsApp']) });
    expect(copy).toMatchObject({ title: 'Cross Chappal', brand: 'Sukoon Sole', kicker: 'NEW ARRIVAL', showcase: 'Soft cushioned sole', features: ['Made for all day'], cta: 'Order on WhatsApp', price: '₹899' });
    const lines = copyLines(copy).map(normalise);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('handles a missing price, offer and brand, and falls back to a default call to action', () => {
    const copy = buildCopy({ language: 'hi', template: 'SHOWCASE', productName: 'कॉटन कुर्ती', businessName: '', priceText: null, offerText: null, scenes: scenes(['कॉटन कुर्ती', 'आरामदायक और सुंदर']) });
    expect(copy).toMatchObject({ brand: null, price: null, offer: null, kicker: null, showcase: 'आरामदायक और सुंदर', features: [], cta: 'अभी DM करें' });
  });
});

describe('sceneLayout', () => {
  it('opens and ends on the main photo and gives each extra photo its own middle scene', () => {
    const photos = (n: number) => sceneLayout(n).map((l) => l.photo);
    expect(photos(1)).toEqual([0, 0, 0, 0]);
    expect(photos(2)).toEqual([0, 1, 1, 0]);
    expect(photos(3)).toEqual([0, 1, 2, 0]);
    expect(photos(5)).toEqual([0, 1, 2, 3, 4, 0]);
    expect(sceneLayout(5).map((l) => l.kind)).toEqual(['intro', 'showcase', 'features', 'gallery', 'gallery', 'outro']);
  });

  it('plans back-to-back scenes for five photos and shows the whole product at the end', () => {
    const stages = Array.from({ length: 5 }, () => ({ width: 900, height: 1000 }));
    const plan = planScenes({ duration: 15, level: 'BALANCED', stages });
    expect(plan.scenes).toHaveLength(6);
    expect(plan.scenes.at(-1)!.end).toBeCloseTo(15, 5);
    plan.scenes.slice(1).forEach((s, i) => expect(s.start).toBe(plan.scenes[i]!.end));
    const centres = plan.scenes.map((s) => s.product!.cx0);
    expect(new Set(centres.slice(0, 4)).size).toBeGreaterThan(2);
    expect(plan.scenes.at(-1)!.product!.s1).toBeLessThanOrEqual(1.0001 * Math.min(1000 / 900, 1040 / 1000));
  });
});

describe('planScenes', () => {
  it.each([10, 15, 30])('makes four back-to-back scenes that fill exactly %i seconds', (duration) => {
    const plan = planScenes({ duration, level: 'BALANCED', stage: { width: 900, height: 1000 } });
    expect(plan.scenes.map((s) => s.kind)).toEqual(['intro', 'showcase', 'features', 'outro']);
    expect(plan.scenes[0]!.start).toBe(0);
    expect(plan.scenes.at(-1)!.end).toBeCloseTo(duration, 5);
    plan.scenes.slice(1).forEach((s, i) => expect(s.start).toBe(plan.scenes[i]!.end));
    plan.scenes.slice(0, -1).forEach((s) => expect(s.length).toBeCloseTo(s.end - s.start + plan.transition, 5));
    expect(new Set(plan.scenes.map((s) => s.variant)).size).toBe(4);
    expect(plan.scenes[0]!.product!.entrance).not.toBeNull();
  });

  it('keeps the product inside the frame at its largest', () => {
    const stage = { width: 700, height: 1200 };
    for (const level of ['SUBTLE', 'BALANCED', 'DYNAMIC'] as const) {
      for (const s of planScenes({ duration: 10, level, stage }).scenes) {
        const scale = Math.max(s.product!.s0, s.product!.s1);
        const half = (stage.width * scale) / 2;
        expect(Math.min(s.product!.cx0, s.product!.cx1) - half).toBeGreaterThan(-60);
        expect(Math.max(s.product!.cx0, s.product!.cx1) + half).toBeLessThan(1080 + 60);
        expect(s.product!.cy - (stage.height * scale) / 2).toBeGreaterThan(200);
      }
    }
  });

  it('keeps the camera gentle over an AI scene, so a product that fills the frame is never cropped by the zoom', () => {
    for (const level of ['SUBTLE', 'BALANCED', 'DYNAMIC'] as const) {
      for (const s of planScenes({ duration: 10, level, stage: null }).scenes) {
        // Share of the scene lost on the worst side at the strongest zoom: the zoom crop, plus the pan shifting it to one
        // side. It must stay well under the ~8% margin Gemini leaves around the product.
        const crop = (1 - 1 / Math.max(s.camera.z0, s.camera.z1)) / 2;
        const pan = Math.max(Math.abs(s.camera.px0), Math.abs(s.camera.px1), Math.abs(s.camera.py0), Math.abs(s.camera.py1));
        expect(crop * (1 + pan)).toBeLessThan(0.045);
        expect(s.product).toBeNull();
      }
    }
  });

  it('still moves the camera over an AI scene (a drift, not a frozen picture)', () => {
    const scenes = planScenes({ duration: 10, level: 'BALANCED', stage: null }).scenes;
    expect(scenes.some((s) => Math.abs(s.camera.z1 - s.camera.z0) > 0.005 || s.camera.px0 !== s.camera.px1)).toBe(true);
  });

  it('chains transitions so each scene starts on time, with gentler motion when subtle', () => {
    const plan = planScenes({ duration: 15, level: 'DYNAMIC', stage: null });
    const graph = transitionGraph(plan).join(';');
    plan.scenes.slice(1).forEach((s) => expect(graph).toContain(`offset=${s.start}`));
    expect(graph).toContain(`trim=duration=15`);
    expect(planScenes({ duration: 10, level: 'SUBTLE', stage: null }).scenes.every((s) => !s.transition || s.transition === 'fade')).toBe(true);
    expect(planScenes({ duration: 10, level: 'SUBTLE', stage: null }).k).toBeLessThan(plan.k);
  });
});

describe('audio', () => {
  it('makes silence without music and a music bed with it, always exactly as long as the Reel', () => {
    const plain = audioGraph({ duration: 15, music: 'NONE' });
    expect(plain).toContain('anullsrc');
    expect(plain).toContain('atrim=0:15');
    expect(plain).not.toContain('aevalsrc');
    const music = audioGraph({ duration: 10, music: 'CALM' });
    expect(music).toContain('aevalsrc=');
    expect(music).toContain('[aout]');
    expect(musicExpression('NONE')).toBeNull();
  });
});

describe('typography', () => {
  it('measures contrast and picks readable text, adding a plate when the backdrop is mid-grey', async () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    const onCream = await titleLayer('Cross Chappal', 1350, { ink: '#2B2118', sub: '#6A5642', accent: '#A8812F', behind: [241, 230, 214], style: 'CLASSIC', language: 'en' }, 0.5);
    expect(onCream.contrast).toBeGreaterThan(10);
    const onGrey = await titleLayer('Cross Chappal', 1350, { ink: '#888888', sub: '#888888', accent: '#A8812F', behind: [128, 128, 128], style: 'MODERN', language: 'en' }, 0.5);
    expect(onGrey.contrast).toBeGreaterThanOrEqual(3);
  });
});

describe('cutoutProduct', () => {
  it('removes a plain backdrop without touching the product pixels, and keeps light parts inside the product', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#f5f5f3"/><rect x="200" y="200" width="400" height="600" rx="60" fill="#8e2c52"/><rect x="330" y="420" width="140" height="160" fill="#f5f5f3"/></svg>`;
    const cut = await cutoutProduct(await sharp(Buffer.from(svg)).png().toBuffer());
    expect(cut.isolated).toBe(true);
    const { data, info } = await sharp(cut.png).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4));
    expect(px(0, 0)[3]).toBe(0);
    expect(px(Math.round(info.width * 0.25), Math.round(info.height * 0.25))).toEqual([142, 44, 82, 255]);
    // The light window is enclosed by the product, so it is kept (not background).
    expect(px(Math.round(info.width / 2), Math.round(info.height / 2))[3]).toBe(255);
  });

  it('falls back to the whole photo with soft edges on a busy background', async () => {
    const noise = await sharp(Buffer.from(Array.from({ length: 200 * 250 * 3 }, (_, i) => (i * 7919) % 251)), { raw: { width: 200, height: 250, channels: 3 } }).png().toBuffer();
    const cut = await cutoutProduct(noise);
    expect(cut.isolated).toBe(false);
    expect([cut.width, cut.height]).toEqual([200, 250]);
  });
});

describe('renderReelVideo (real ffmpeg)', () => {
  const expectReel = async (video: Buffer, seconds: number) => {
    const probe = await probeBuffer(video, 'mp4');
    expect([probe.width, probe.height, probe.videoCodec, probe.audioCodec]).toEqual([1080, 1920, 'h264', 'aac']);
    expect(Math.abs(probe.durationSec - seconds)).toBeLessThan(0.12);
  };

  it('makes a 10 s four-scene Reel that passes quality control', async () => {
    const out = await renderReelVideo({ image: await testPhoto(), template: 'SHOWCASE', scenes: sampleScenes('en'), ...base('en') });
    await expectReel(out.video, 10);
    expect(out.thumbnail.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(out.report.passed).toBe(true);
    expect(out.report.method).toBe('cutout');
    expect(out.report.checks.map((c) => c.id)).toEqual(['blank_frames', 'transitions', 'scene_variation', 'product_visible', 'text_contrast', 'no_repeated_text', 'audio_sync']);
    expect(out.report.checks.find((c) => c.id === 'scene_variation')!.ok).toBe(true);
    expect(out.report.checks.find((c) => c.id === 'no_repeated_text')!.ok).toBe(true);
  });

  it('honours 15 s, dark luxury, bold text, dynamic motion and music', async () => {
    const out = await renderReelVideo({ image: await testPhoto(), template: 'SPECIAL_OFFER', scenes: sampleScenes('en'), ...base('en'), duration: 15, background: 'LUXURY_DARK', textStyle: 'BOLD', animation: 'DYNAMIC', music: 'UPBEAT' });
    await expectReel(out.video, 15);
    expect(out.report.passed).toBe(true);
  });

  it('makes a 30 s Reel with no price and no business name', async () => {
    const out = await renderReelVideo({ image: await testPhoto(true), template: 'MINIMAL_PREMIUM', scenes: sampleScenes('en'), ...base('en'), priceText: null, offerText: null, businessName: '', duration: 30, background: 'WHITE_STUDIO', animation: 'SUBTLE', music: 'ELEGANT' });
    await expectReel(out.video, 30);
    expect(out.report.passed).toBe(true);
  });

  it('moves the camera over an AI scene instead of cutting the product out', async () => {
    const out = await renderReelVideo({ image: await testPhoto(true), template: 'SHOWCASE', scenes: sampleScenes('en'), ...base('en'), plate: true });
    await expectReel(out.video, 10);
    expect(out.report.method).toBe('ai_scene');
  });

  it('refuses a photo that cannot be read', async () => {
    await expect(renderReelVideo({ image: Buffer.from('not an image'), template: 'SHOWCASE', scenes: [], ...base() })).rejects.toThrow('product photo could not be read');
  });

  it('uses several photos, one per middle scene, and still passes quality control', async () => {
    const out = await renderReelVideo({ image: await testPhoto(), extraImages: [await testPhoto(true), await testPhoto()], template: 'SHOWCASE', scenes: sampleScenes('en'), ...base('en'), duration: 15 });
    await expectReel(out.video, 15);
    expect(out.report.passed).toBe(true);
  });

  it('renders Hindi and Marathi text as real glyphs, not empty boxes', async () => {
    const image = await testPhoto();
    const frames: Record<string, Buffer> = {};
    for (const language of ['hi', 'mr', 'en'] as const) {
      const { video } = await renderReelVideo({ image, template: 'SPECIAL_OFFER', scenes: sampleScenes(language), ...base(language) });
      frames[language] = await extractFrame(video, 1.6);
    }
    // Missing-glyph boxes would look identical for every word; real text makes the three languages differ.
    expect(frames['hi']!.equals(frames['mr']!)).toBe(false);
    expect(frames['hi']!.equals(frames['en']!)).toBe(false);
  });
});
