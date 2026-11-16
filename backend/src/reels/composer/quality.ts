import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { MediaProbe } from '../media-probe';
import { requireFfmpeg } from '../media-probe';
import { copyLines, normalise, type ReelCopy } from './copy';
import type { Plan } from './scene-plan';
import { MIN_CONTRAST, type TextLayer } from './typography';

const run = promisify(execFile);

export interface QualityCheck {
  id: 'blank_frames' | 'transitions' | 'scene_variation' | 'product_visible' | 'text_contrast' | 'no_repeated_text' | 'audio_sync';
  ok: boolean;
  /** A failed blocking check stops the Reel from being shown; the rest are warnings for the owner. */
  blocking: boolean;
  detail: string;
}

export interface QualityReport {
  passed: boolean;
  method: 'cutout' | 'feathered' | 'ai_scene';
  durationSec: number;
  checks: QualityCheck[];
}

const SAMPLE = { w: 54, h: 96 };
/** A frame this flat (grey-level spread) is a single colour: black, white or an empty backdrop. Dark studio frames measure 4+. */
const BLANK_SPREAD = 1.5;

/** Small greyscale frames at the given times, decoded in one ffmpeg pass. */
export async function sampleFrames(video: Buffer, times: number[], fps = 30): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'growpilot-qc-'));
  try {
    const file = join(dir, 'in.mp4');
    await writeFile(file, video);
    const frames = times.map((t) => Math.max(0, Math.round(t * fps)));
    const select = frames.map((n) => `eq(n,${n})`).join('+');
    const { stdout } = await run(
      requireFfmpeg(),
      ['-loglevel', 'error', '-i', file, '-vf', `select='${select}',scale=${SAMPLE.w}:${SAMPLE.h},format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
    );
    const size = SAMPLE.w * SAMPLE.h;
    const out: Buffer[] = [];
    for (let i = 0; i + size <= stdout.length; i += size) out.push(stdout.subarray(i, i + size));
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function spread(frame: Buffer): number {
  let sum = 0;
  let sq = 0;
  for (const v of frame) {
    sum += v;
    sq += v * v;
  }
  const mean = sum / frame.length;
  return Math.sqrt(Math.max(0, sq / frame.length - mean * mean));
}

export function difference(a: Buffer, b: Buffer): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  return d / a.length;
}

export async function checkReel(input: {
  video: Buffer;
  plan: Plan;
  copy: ReelCopy;
  texts: TextLayer[];
  productShares: number[] | null;
  method: QualityReport['method'];
  probe: MediaProbe;
}): Promise<QualityReport> {
  const { plan } = input;
  const mids = plan.scenes.map((s) => (s.start + s.end) / 2 + plan.transition / 4);
  const joins = plan.scenes.slice(1).map((s) => s.start + plan.transition / 2);
  const frameOf = (t: number) => Math.max(0, Math.round(t * 30));
  const unique = [...new Set([...mids, ...joins].map(frameOf))].sort((a, b) => a - b);
  const frames = await sampleFrames(input.video, unique.map((n) => n / 30));
  const at = (t: number) => frames[unique.indexOf(frameOf(t))];
  const checks: QualityCheck[] = [];

  const sceneFrames = mids.map(at).filter((f): f is Buffer => !!f);
  const blank = sceneFrames.filter((f) => spread(f) < BLANK_SPREAD).length;
  const flattest = (fs: Buffer[]) => (fs.length ? Math.min(...fs.map(spread)).toFixed(1) : 'n/a');
  checks.push({ id: 'blank_frames', ok: sceneFrames.length === mids.length && blank === 0, blocking: true, detail: `${sceneFrames.length - blank}/${mids.length} scene frames have content (flattest ${flattest(sceneFrames)})` });

  const joinFrames = joins.map(at).filter((f): f is Buffer => !!f);
  const badJoins = joinFrames.filter((f) => spread(f) < BLANK_SPREAD).length;
  checks.push({ id: 'transitions', ok: joinFrames.length === joins.length && badJoins === 0, blocking: true, detail: `${joins.length} transitions, ${badJoins} blank (flattest ${flattest(joinFrames)})` });

  const diffs = sceneFrames.slice(1).map((f, i) => difference(sceneFrames[i]!, f));
  const minDiff = diffs.length ? Math.min(...diffs) : 0;
  checks.push({ id: 'scene_variation', ok: minDiff >= 4, blocking: false, detail: `smallest change between consecutive scenes: ${minDiff.toFixed(1)}` });

  if (input.productShares) {
    const smallest = Math.min(...input.productShares);
    checks.push({ id: 'product_visible', ok: smallest >= 0.05, blocking: false, detail: `product covers at least ${(smallest * 100).toFixed(0)}% of the frame in every scene (${input.method})` });
  } else {
    checks.push({ id: 'product_visible', ok: true, blocking: false, detail: 'AI scene: the product is part of the background image' });
  }

  const weakest = input.texts.reduce((m, t) => Math.min(m, t.contrast), Infinity);
  checks.push({ id: 'text_contrast', ok: !input.texts.length || weakest >= MIN_CONTRAST.large, blocking: false, detail: input.texts.length ? `lowest text contrast ${weakest.toFixed(1)}:1` : 'no text' });

  const lines = copyLines(input.copy).map(normalise);
  const repeated = lines.filter((l, i) => lines.indexOf(l) !== i);
  checks.push({ id: 'no_repeated_text', ok: repeated.length === 0, blocking: false, detail: repeated.length ? `repeated: ${repeated.join(', ')}` : `${lines.length} unique lines` });

  const drift = Math.abs(input.probe.durationSec - plan.duration);
  const audioOk = input.probe.audioCodec === 'aac' && input.probe.videoCodec === 'h264' && drift <= 0.15;
  checks.push({ id: 'audio_sync', ok: audioOk, blocking: true, detail: `length ${input.probe.durationSec.toFixed(2)} s for a ${plan.duration} s Reel, audio ${input.probe.audioCodec ?? 'missing'}` });

  return { passed: checks.every((c) => c.ok || !c.blocking), method: input.method, durationSec: input.probe.durationSec, checks };
}
