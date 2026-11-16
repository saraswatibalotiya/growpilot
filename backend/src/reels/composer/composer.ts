import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { probeBuffer, requireFfmpeg } from '../media-probe';
import type {
  AnimationLevel,
  BackgroundStyle,
  MusicTrack,
  ReelLanguage,
  ReelScene,
  ReelTemplate,
  TextStyle,
} from '../reels.constants';
import { ReelUserError } from '../reel-user-error';
import {
  BH,
  BW,
  glowPng,
  H,
  lightSweepPng,
  PALETTES,
  particlesPng,
  plateScrimSvg,
  studioBackground,
  SWEEP_W,
  W,
} from './backgrounds';
import { buildCopy, type ReelCopy } from './copy';
import { buildStage, cutoutProduct, type ProductStage } from './cutout';
import { audioGraph } from './music';
import { checkReel, type QualityReport } from './quality';
import {
  planScenes,
  productShare,
  type Plan,
  type ScenePlan,
} from './scene-plan';
import {
  bodyLayer,
  brandLayer,
  monogramLayer,
  pillLayer,
  priceLayer,
  titleLayer,
  type Rgb,
  type TextLayer,
  type TextLook,
} from './typography';

const run = promisify(execFile);

/** The finished video failed a blocking quality check. The report says which. */
export class ReelQualityError extends ReelUserError {
  constructor(readonly report: QualityReport) {
    super('The video did not pass the final quality check. Please try again.');
  }
}
export const FPS = 30;

/** Accent colour per template; the template also decides the kicker / offer treatment. */
export const TEMPLATE_ACCENT: Record<ReelTemplate, string> = {
  SHOWCASE: '#A8812F',
  NEW_ARRIVALS: '#C2185B',
  SPECIAL_OFFER: '#C62828',
  MINIMAL_PREMIUM: '#6D5D4E',
};
const ACCENT_ON_DARK: Record<ReelTemplate, string> = {
  SHOWCASE: '#D9B56A',
  NEW_ARRIVALS: '#FF5C8A',
  SPECIAL_OFFER: '#FF6B5E',
  MINIMAL_PREMIUM: '#CDBBA6',
};

export interface CompositionInput {
  /** The main photo first, then up to four more. */
  images: Buffer[];
  template: ReelTemplate;
  language: ReelLanguage;
  scenes: ReelScene[];
  productName: string;
  priceText: string | null;
  offerText: string | null;
  businessName: string;
  duration: number;
  background: BackgroundStyle;
  animation: AnimationLevel;
  textStyle: TextStyle;
  music: MusicTrack;
  /** The images are full AI scenes that already contain the product: no cutout, the camera moves over them. */
  plate: boolean;
  onStage?: (stage: 'SCENES' | 'RENDERING') => Promise<void> | void;
}

export interface CompositionOutput {
  video: Buffer;
  thumbnail: Buffer;
  report: QualityReport;
}

interface Layered {
  plan: Plan;
  copy: ReelCopy;
  backgrounds: Buffer[];
  /** One product layer per photo; null entries are AI scenes. */
  stages: Array<ProductStage | null>;
  coverages: number[];
  isolated: boolean;
  texts: TextLayer[][];
}

/** Mean colour of the backdrop under a horizontal band of the frame (the backdrop is drawn larger and centred). */
async function behind(bg: Buffer, y: number, height: number): Promise<Rgb> {
  const ox = (BW - W) / 2;
  const oy = (BH - H) / 2;
  const top = Math.max(0, Math.round(oy + y));
  const { channels } = await sharp(bg)
    .extract({
      left: Math.round(ox + 60),
      top,
      width: W - 120,
      height: Math.min(Math.round(height), BH - top),
    })
    .stats();
  return [channels[0]!.mean, channels[1]!.mean, channels[2]!.mean].map(
    Math.round,
  ) as Rgb;
}

/** Text for each scene, laid out inside the safe area. Every line is used once. */
async function sceneTexts(
  scene: ScenePlan,
  copy: ReelCopy,
  bg: Buffer,
  base: Omit<TextLook, 'behind'>,
  T: number,
): Promise<TextLayer[]> {
  const look = async (y: number, h: number): Promise<TextLook> => ({
    ...base,
    behind: await behind(bg, y, h),
  });
  const at = (s: number) => Math.round((T * 0.5 + s) * 100) / 100;
  const out: TextLayer[] = [];
  switch (scene.kind) {
    case 'intro':
      if (copy.brand)
        out.push(
          await brandLayer(copy.brand, 250, await look(250, 90), at(0.1)),
        );
      if (copy.kicker)
        out.push(
          await pillLayer(copy.kicker, 360, await look(360, 92), at(0.35), {
            size: 40,
            anim: 'pop',
          }),
        );
      out.push(
        await titleLayer(copy.title, 1350, await look(1350, 230), at(0.45)),
      );
      break;
    case 'showcase':
      if (copy.showcase)
        out.push(
          await bodyLayer(copy.showcase, 1400, await look(1400, 170), at(0.3)),
        );
      break;
    case 'features':
      for (const [i, f] of copy.features.entries())
        out.push(
          await pillLayer(
            f,
            1300 + i * 118,
            await look(1300 + i * 118, 100),
            at(0.25 + i * 0.35),
            { size: 42, fill: base.ink, align: 'right' },
          ),
        );
      break;
    case 'outro': {
      if (copy.brand)
        out.push(
          await monogramLayer(copy.brand, 236, await look(236, 190), at(0.1)),
        );
      let y = 1230;
      if (copy.offer) {
        out.push(
          await pillLayer(copy.offer, y, await look(y, 88), at(0.2), {
            size: 40,
            anim: 'pop',
          }),
        );
        y += 96;
      }
      if (copy.price) {
        out.push(
          await priceLayer(
            copy.price,
            y,
            await look(y, 150),
            at(copy.offer ? 0.45 : 0.3),
          ),
        );
        y += 160;
      }
      out.push(
        await pillLayer(
          copy.cta,
          Math.min(y, 1470),
          await look(Math.min(y, 1470), 92),
          at(copy.price ? 0.75 : 0.4),
          { size: 42, anim: 'rise', fill: base.ink },
        ),
      );
      break;
    }
    case 'gallery':
      break;
  }
  return out;
}

async function layer(input: CompositionInput): Promise<Layered> {
  const palette = PALETTES[input.background];
  const stages: Array<ProductStage | null> = [];
  const coverages: number[] = [];
  const plateBgs: Array<Buffer | null> = [];
  let isolated = true;
  for (const image of input.images) {
    if (input.plate) {
      try {
        plateBgs.push(
          await sharp(image, { failOn: 'error' })
            .rotate()
            .resize(BW, BH, {
              fit: 'cover',
              position: sharp.strategy.attention,
            })
            .removeAlpha()
            .composite([{ input: plateScrimSvg(), left: 0, top: 0 }])
            .png()
            .toBuffer(),
        );
      } catch {
        throw new ReelUserError(
          'The product photo could not be read. Please choose another photo.',
        );
      }
      stages.push(null);
      coverages.push(1);
    } else {
      const cut = await cutoutProduct(image);
      stages.push(
        await buildStage(cut, {
          reflection: palette.reflection,
          dark: palette.dark,
        }),
      );
      coverages.push(cut.coverage);
      isolated &&= cut.isolated;
      plateBgs.push(null);
    }
  }
  const plan = planScenes({
    duration: input.duration,
    level: input.animation,
    stages: stages.map((st) =>
      st ? { width: st.width, height: st.height } : null,
    ),
  });
  const copy = buildCopy({
    language: input.language,
    template: input.template,
    productName: input.productName,
    businessName: input.businessName,
    scenes: input.scenes,
    priceText: input.priceText,
    offerText: input.offerText,
  });
  const backgrounds = await Promise.all(
    plan.scenes.map((s) =>
      plateBgs[s.photo]
        ? Promise.resolve(plateBgs[s.photo]!)
        : studioBackground(input.background, s.variant),
    ),
  );
  const dark = input.plate ? false : palette.dark;
  const base: Omit<TextLook, 'behind'> = {
    ink: input.plate ? '#FFFFFF' : palette.ink,
    sub: input.plate ? '#FFFFFF' : palette.sub,
    accent: dark
      ? ACCENT_ON_DARK[input.template]
      : TEMPLATE_ACCENT[input.template],
    style: input.textStyle,
    language: input.language,
    overPhoto: input.plate,
  };
  const texts = await Promise.all(
    plan.scenes.map((s, i) =>
      sceneTexts(s, copy, backgrounds[i]!, base, i === 0 ? 0 : plan.transition),
    ),
  );
  return { plan, copy, backgrounds, stages, coverages, isolated, texts };
}

const ease = (a: number, d: number) => `(1-pow(1-clip((t-${a})/${d},0,1),3))`;

/** The filter graph for one scene: animated backdrop, drifting light, particles, product, light sweep and text. */
function sceneGraph(
  i: number,
  scene: ScenePlan,
  inputs: SceneInputs,
  plan: Plan,
  stage: ProductStage | null,
): string[] {
  const N = Math.round(scene.length * FPS);
  const c = scene.camera;
  const p = `(on/${N})`;
  const smooth = `((1-cos(PI*${p}))/2)`;
  const parts: string[] = [];
  parts.push(
    `[${inputs.bg}:v]zoompan=z='${c.z0}+(${c.z1 - c.z0})*${smooth}':x='(iw-iw/zoom)/2*(1+(${c.px0}+(${c.px1 - c.px0})*${smooth}))':y='(ih-ih/zoom)/2*(1+(${c.py0}+(${c.py1 - c.py0})*${smooth}))':d=${N}:s=${W}x${H}:fps=${FPS},setsar=1,format=rgba[s${i}bg]`,
  );
  let cur = `s${i}bg`;
  const next = (label: string) => {
    cur = label;
    return label;
  };
  parts.push(`[${inputs.glow}:v]format=rgba[s${i}gl]`);
  parts.push(
    `[${cur}][s${i}gl]overlay=x='-420+${W * 0.5}*t/${scene.length}+${i * 160}':y='${[150, 380, 260, 120][i % 4]}':eval=frame[${next(`s${i}a`)}]`,
  );
  if (inputs.particles !== null) {
    parts.push(`[${inputs.particles}:v]format=rgba[s${i}pt]`);
    parts.push(
      `[${cur}][s${i}pt]overlay=x=0:y='-mod(${i * 300}+t*${Math.round(38 * plan.k)},${H})'[${next(`s${i}b`)}]`,
    );
  }
  if (scene.product && stage && inputs.product !== null) {
    const m = scene.product;
    const P = `((1-cos(PI*clip(t/${scene.length},0,1)))/2)`;
    const fade = m.entrance
      ? `,fade=t=in:st=${m.entrance.at}:d=0.6:alpha=1`
      : '';
    parts.push(
      `[${inputs.product}:v]format=rgba,scale=w='trunc(${stage.width}*(${m.s0.toFixed(4)}+(${(m.s1 - m.s0).toFixed(4)})*${P})/2)*2':h=-2:eval=frame${fade}[s${i}pr]`,
    );
    const rise = m.entrance
      ? `+${m.entrance.from}*(1-${ease(m.entrance.at, m.entrance.dur)})`
      : '';
    parts.push(
      `[${cur}][s${i}pr]overlay=x='${m.cx0}+(${m.cx1 - m.cx0})*${P}-w/2':y='${m.cy}-h/2${rise}':eval=frame[${next(`s${i}c`)}]`,
    );
  }
  if (scene.sweepAt !== null && inputs.sweep !== null) {
    const a = scene.sweepAt;
    parts.push(`[${inputs.sweep}:v]format=rgba[s${i}sw]`);
    parts.push(
      `[${cur}][s${i}sw]overlay=x='-${SWEEP_W}+${W + SWEEP_W}*clip((t-${a})/1.3,0,1)':y=0:enable='between(t,${a},${a + 1.3})'[${next(`s${i}d`)}]`,
    );
  }
  inputs.texts.forEach((t, j) => {
    const e = ease(t.appear, 0.55);
    if (t.anim === 'pop') {
      parts.push(
        `[${t.input}:v]format=rgba,scale=w='trunc(${W}*(0.86+0.14*${e})/2)*2':h=-2:eval=frame,fade=t=in:st=${t.appear}:d=0.35:alpha=1[s${i}t${j}]`,
      );
      parts.push(
        `[${cur}][s${i}t${j}]overlay=x='(W-w)/2':y='${t.y}+(${t.height}-h)/2':eval=frame[${next(`s${i}e${j}`)}]`,
      );
    } else {
      const dx =
        t.anim === 'slide' ? `${Math.round(110 * plan.k)}*(1-${e})` : '0';
      const dy =
        t.anim === 'rise' ? `${Math.round(48 * plan.k)}*(1-${e})` : '0';
      parts.push(
        `[${t.input}:v]format=rgba,fade=t=in:st=${t.appear}:d=0.45:alpha=1[s${i}t${j}]`,
      );
      parts.push(
        `[${cur}][s${i}t${j}]overlay=x='${dx}':y='${t.y}+${dy}':eval=frame[${next(`s${i}e${j}`)}]`,
      );
    }
  });
  parts.push(
    `[${cur}]trim=duration=${scene.length},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[s${i}]`,
  );
  return parts;
}

interface SceneInputs {
  bg: number;
  glow: number;
  particles: number | null;
  product: number | null;
  sweep: number | null;
  texts: Array<TextLayer & { input: number }>;
}

/** Joins the scenes with transitions. Scene k starts exactly at plan.scenes[k].start in the finished Reel. */
export function transitionGraph(plan: Plan): string[] {
  const parts: string[] = [];
  let cur = 's0';
  for (let k = 1; k < plan.scenes.length; k++) {
    const out = k === plan.scenes.length - 1 ? 'vx' : `x${k}`;
    parts.push(
      `[${cur}][s${k}]xfade=transition=${plan.scenes[k - 1]!.transition}:duration=${plan.transition}:offset=${plan.scenes[k]!.start}[${out}]`,
    );
    cur = out;
  }
  parts.push(
    `[${cur}]trim=duration=${plan.duration},setpts=PTS-STARTPTS,format=yuv420p[vout]`,
  );
  return parts;
}

/** Renders the multi-scene Reel: 1080x1920, 30 fps, H.264 + AAC, exactly `duration` seconds, then runs quality control. */
export async function renderComposition(
  input: CompositionInput,
): Promise<CompositionOutput> {
  const ffmpeg = requireFfmpeg();
  await input.onStage?.('SCENES');
  const layered = await layer(input);
  const { plan, stages } = layered;
  const palette = PALETTES[input.background];

  const dir = await mkdtemp(join(tmpdir(), 'growpilot-reel-'));
  try {
    await input.onStage?.('RENDERING');
    const args = ['-y', '-loglevel', 'error'];
    let count = 0;
    const file = async (name: string, data: Buffer) => {
      const path = join(dir, name);
      await writeFile(path, data);
      return path;
    };
    const still = (path: string, seconds: number) => {
      args.push(
        '-framerate',
        String(FPS),
        '-loop',
        '1',
        '-t',
        String(seconds),
        '-i',
        path,
      );
      return count++;
    };
    const single = (path: string) => {
      args.push('-i', path);
      return count++;
    };

    const glow = await file('glow.png', await glowPng(input.background));
    const particleCount = palette.dark
      ? Math.max(plan.particles, 14)
      : plan.particles;
    const particles = particleCount
      ? await file(
          'particles.png',
          await particlesPng(palette.particle, particleCount),
        )
      : null;
    const sweep = await file(
      'sweep.png',
      await lightSweepPng(palette.dark ? 0.1 : 0.22),
    );
    const products = await Promise.all(
      stages.map(async (st, n) =>
        st ? file(`product${n}.png`, st.png) : null,
      ),
    );

    const graph: string[] = [];
    for (const [i, scene] of plan.scenes.entries()) {
      const bg = await file(`bg${i}.png`, layered.backgrounds[i]!);
      const inputs: SceneInputs = {
        bg: single(bg),
        glow: still(glow, scene.length),
        particles: particles ? still(particles, scene.length) : null,
        product:
          products[scene.photo] && scene.product
            ? still(products[scene.photo]!, scene.length)
            : null,
        sweep: scene.sweepAt !== null ? still(sweep, scene.length) : null,
        texts: [],
      };
      for (const [j, t] of layered.texts[i]!.entries())
        inputs.texts.push({
          ...t,
          input: still(await file(`t${i}_${j}.png`, t.png), scene.length),
        });
      graph.push(
        ...sceneGraph(i, scene, inputs, plan, stages[scene.photo] ?? null),
      );
    }
    graph.push(...transitionGraph(plan));
    graph.push(audioGraph({ duration: plan.duration, music: input.music }));

    const out = join(dir, 'reel.mp4');
    args.push(
      '-filter_complex',
      graph.join(';'),
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-t',
      String(plan.duration),
      '-r',
      String(FPS),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      out,
    );
    await run(ffmpeg, args, {
      timeout: Math.max(240_000, plan.duration * 20_000),
      maxBuffer: 10 * 1024 * 1024,
    });

    const showcase = plan.scenes[1]!;
    const thumbAt = (
      showcase.start +
      (showcase.end - showcase.start) * 0.6
    ).toFixed(2);
    const thumb = join(dir, 'thumb.jpg');
    await run(
      ffmpeg,
      [
        '-y',
        '-loglevel',
        'error',
        '-ss',
        thumbAt,
        '-i',
        out,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        thumb,
      ],
      { timeout: 60_000 },
    );
    const video = await readFile(out);

    const report = await checkReel({
      video,
      plan,
      copy: layered.copy,
      texts: layered.texts.flat(),
      productShares: plan.scenes.map((s) =>
        stages[s.photo]
          ? productShare(s, stages[s.photo]!, layered.coverages[s.photo]!)
          : 1,
      ),
      method: input.plate
        ? 'ai_scene'
        : layered.isolated
          ? 'cutout'
          : 'feathered',
      probe: await probeBuffer(video, 'mp4'),
    });
    if (!report.passed) throw new ReelQualityError(report);
    return { video, thumbnail: await readFile(thumb), report };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
