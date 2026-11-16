import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

const REEL = { width: 1080, height: 1920, secondsPerSlide: 3, fps: 30 } as const;

/** The ffmpeg filter graph: each slide fits whole over a blurred copy of itself, then the slides play one after another. */
function reelFilter(slides: number): string {
  const { width, height, fps } = REEL;
  const parts: string[] = [];
  for (let i = 0; i < slides; i++) {
    parts.push(
      `[${i}:v]split[a${i}][b${i}];` +
        `[a${i}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=30:5[bg${i}];` +
        `[b${i}]scale=${width}:-2:force_original_aspect_ratio=decrease[fg${i}];` +
        `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`,
    );
  }
  const joined = Array.from({ length: slides }, (_, i) => `[v${i}]`).join('');
  parts.push(`${joined}concat=n=${slides}:v=1:a=0[out]`);
  return parts.join(';');
}

/** Makes a silent vertical MP4 (H.264) slideshow from the given pictures, in order. Nothing is written outside a temp folder. */
export async function renderReel(images: Buffer[]): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('The video tool (ffmpeg) is not available on this server');
  if (images.length === 0) throw new Error('A Reel needs at least one photo');
  const dir = await mkdtemp(join(tmpdir(), 'growpilot-reel-'));
  try {
    const args = ['-y', '-loglevel', 'error'];
    for (const [i, image] of images.entries()) {
      const file = join(dir, `slide-${i}.img`);
      await writeFile(file, image);
      args.push('-loop', '1', '-t', String(REEL.secondsPerSlide), '-i', file);
    }
    const out = join(dir, 'reel.mp4');
    // Instagram's video pipeline is most reliable with an audio track, so add a silent one.
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    args.push('-filter_complex', reelFilter(images.length), '-map', '[out]', '-map', `${images.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out);
    await run(ffmpegPath, args, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
