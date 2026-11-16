import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

export interface MediaProbe {
  durationSec: number;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
}

export function requireFfmpeg(): string {
  if (!ffmpegPath) throw new Error('The video tool (ffmpeg) is not available on this server');
  return ffmpegPath;
}

/** ffprobe is not bundled, so the stream summary is read from ffmpeg's own banner. */
export async function probeFile(file: string): Promise<MediaProbe> {
  let banner = '';
  try {
    await run(requireFfmpeg(), ['-hide_banner', '-i', file], { timeout: 30_000 });
  } catch (error) {
    banner = String((error as { stderr?: string }).stderr ?? '');
  }
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(banner);
  const video = /Video:\s*([a-z0-9_]+)[^\n]*?,\s*(\d{2,5})x(\d{2,5})/i.exec(banner);
  const audio = /Audio:\s*([a-z0-9_]+)/i.exec(banner);
  return {
    durationSec: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0,
    width: video ? Number(video[2]) : null,
    height: video ? Number(video[3]) : null,
    videoCodec: video?.[1] ?? null,
    audioCodec: audio?.[1] ?? null,
  };
}

export async function probeBuffer(buffer: Buffer, extension: string): Promise<MediaProbe> {
  const dir = await mkdtemp(join(tmpdir(), 'growpilot-probe-'));
  try {
    const file = join(dir, `in.${extension}`);
    await writeFile(file, buffer);
    return await probeFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
