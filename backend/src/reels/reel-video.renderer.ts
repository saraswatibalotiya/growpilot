import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { renderComposition } from './composer/composer';
import type { QualityReport } from './composer/quality';
import { requireFfmpeg } from './media-probe';
import {
  DEFAULT_BACKGROUND,
  REEL_SECONDS,
  type AnimationLevel,
  type BackgroundStyle,
  type MusicTrack,
  type ReelLanguage,
  type ReelScene,
  type ReelTemplate,
  type TextStyle,
} from './reels.constants';

const run = promisify(execFile);

export { H, W } from './composer/backgrounds';

export interface ReelRenderInput {
  /** The main photo. */
  image: Buffer;
  /** More photos (at most four), shown in the middle scenes. */
  extraImages?: Buffer[];
  template: ReelTemplate;
  language: ReelLanguage;
  scenes: ReelScene[];
  productName: string;
  /** Already formatted from the supplied price, for example "₹899". Null hides it. */
  priceText: string | null;
  /** The owner's own offer words. Null hides the offer. */
  offerText: string | null;
  businessName: string;
  /** Reel length in seconds (10, 15 or 30). Default 10. */
  duration?: number;
  background?: BackgroundStyle;
  animation?: AnimationLevel;
  textStyle?: TextStyle;
  music?: MusicTrack;
  /** The image is an AI scene that already contains the product (no cutout). */
  plate?: boolean;
  onStage?: (stage: 'SCENES' | 'RENDERING') => Promise<void> | void;
}

export interface ReelRenderOutput {
  video: Buffer;
  thumbnail: Buffer;
  report: QualityReport;
}

/** Makes the multi-scene 1080x1920, 30 fps, H.264 + AAC MP4 (music or silence), its thumbnail and a quality report. */
export async function renderReelVideo(input: ReelRenderInput): Promise<ReelRenderOutput> {
  const { image, extraImages, ...rest } = input;
  return renderComposition({
    ...rest,
    images: [image, ...(extraImages ?? [])],
    duration: input.duration ?? REEL_SECONDS,
    background: input.background ?? DEFAULT_BACKGROUND,
    animation: input.animation ?? 'BALANCED',
    textStyle: input.textStyle ?? 'CLASSIC',
    music: input.music ?? 'NONE',
    plate: input.plate ?? false,
  });
}

/** One frame of a rendered MP4 as PNG, for visual checks. */
export async function extractFrame(video: Buffer, atSeconds: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'growpilot-frame-'));
  try {
    await writeFile(join(dir, 'in.mp4'), video);
    await run(requireFfmpeg(), ['-y', '-loglevel', 'error', '-ss', String(atSeconds), '-i', join(dir, 'in.mp4'), '-frames:v', '1', join(dir, 'f.png')], { timeout: 60_000 });
    return await readFile(join(dir, 'f.png'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
