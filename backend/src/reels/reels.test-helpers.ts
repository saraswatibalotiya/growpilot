// Fixtures for the Reel tests: a generated product photo and a short generated voice track. No network.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import type { ReelLanguage, ReelScene } from './reels.constants';

const run = promisify(execFile);

/** A plain "garment" on a studio-grey background; `portrait` makes it exactly 9:16. */
export async function testPhoto(portrait = false): Promise<Buffer> {
  const [w, h] = portrait ? [900, 1600] : [1000, 1250];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9d4cc"/><stop offset="1" stop-color="#a39a8d"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/><path d="M${w * 0.3} ${h * 0.15} L${w * 0.7} ${h * 0.15} L${w * 0.85} ${h * 0.4} L${w * 0.72} ${h * 0.45} L${w * 0.72} ${h * 0.9} L${w * 0.28} ${h * 0.9} L${w * 0.28} ${h * 0.45} L${w * 0.15} ${h * 0.4} Z" fill="#8e2c52"/>` +
    `<circle cx="${w / 2}" cy="${h * 0.3}" r="${w * 0.06}" fill="#f3c969"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/** A sine-tone MP3 of the given length, standing in for a voiceover. */
export async function testVoice(seconds: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'growpilot-testvoice-'));
  try {
    const file = join(dir, 'v.mp3');
    await run(ffmpegPath!, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:a', 'libmp3lame', '-b:a', '64k', file]);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const SAMPLE_TEXT: Record<ReelLanguage, { productName: string; businessName: string; offerText: string; scenes: string[]; caption: string }> = {
  en: { productName: 'Cotton Kurti', businessName: 'Shree Fashion Studio', offerText: 'Flat 20% off this week', scenes: ['Fresh cotton kurti', 'Soft and comfortable', 'Visit Shree Fashion', 'Message us to order'], caption: 'Our cotton kurti is here.' },
  hi: { productName: 'कॉटन कुर्ती', businessName: 'श्री फैशन स्टूडियो', offerText: 'इस हफ्ते २०% की छूट', scenes: ['नई कॉटन कुर्ती', 'आरामदायक और सुंदर', 'श्री फैशन में आइए', 'ऑर्डर के लिए मैसेज करें'], caption: 'हमारी कॉटन कुर्ती आ गई है।' },
  mr: { productName: 'कॉटन कुर्ती', businessName: 'श्री फॅशन स्टुडिओ', offerText: 'या आठवड्यात २०% सवलत', scenes: ['नवीन कॉटन कुर्ती', 'आरामदायक आणि सुंदर', 'श्री फॅशनला भेट द्या', 'ऑर्डरसाठी मेसेज करा'], caption: 'आमची कॉटन कुर्ती आली आहे.' },
};

export function sampleScenes(language: ReelLanguage): ReelScene[] {
  const t = SAMPLE_TEXT[language].scenes;
  const span = 9.3 / t.length;
  return t.map((text, i) => ({ label: `scene ${i + 1}`, text, startSec: Math.round((0.4 + i * span) * 100) / 100, endSec: Math.round((0.4 + (i + 1) * span) * 100) / 100 }));
}
