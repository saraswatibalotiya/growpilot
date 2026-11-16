import type { AnimationLevel } from '../reels.constants';
import { H, W } from './backgrounds';

export type SceneKind = 'intro' | 'showcase' | 'features' | 'gallery' | 'outro';

/** Camera move on the background. Zoom is relative to the full backdrop; pan is -1..1 of the free margin. */
export interface CameraMove {
  z0: number;
  z1: number;
  px0: number;
  px1: number;
  py0: number;
  py1: number;
}

/** Product layer: scale of the stage, centre path, optional entrance from below. */
export interface ProductMove {
  s0: number;
  s1: number;
  cx0: number;
  cx1: number;
  cy: number;
  entrance: { from: number; at: number; dur: number } | null;
}

export interface ScenePlan {
  kind: SceneKind;
  /** Index of the photo this scene shows (0 is the main photo). */
  photo: number;
  /** Where the scene starts and ends in the finished Reel. */
  start: number;
  end: number;
  /** Rendered length: the scene plus the overlap the next transition needs. */
  length: number;
  variant: 0 | 1 | 2 | 3;
  camera: CameraMove;
  product: ProductMove | null;
  /** Light sweep start (seconds into the scene). */
  sweepAt: number | null;
  /** Transition into the next scene. */
  transition: string | null;
}

export interface Plan {
  duration: number;
  transition: number;
  scenes: ScenePlan[];
  /** Strength multiplier for movement. */
  k: number;
  particles: number;
}

const LEVEL: Record<AnimationLevel, { k: number; transition: number; transitions: [string, string, string]; particles: number }> = {
  SUBTLE: { k: 0.6, transition: 0.6, transitions: ['fade', 'fade', 'fade'], particles: 0 },
  BALANCED: { k: 1, transition: 0.5, transitions: ['smoothup', 'smoothleft', 'fade'], particles: 18 },
  DYNAMIC: { k: 1.5, transition: 0.4, transitions: ['slideup', 'smoothleft', 'circleopen'], particles: 30 },
};

/** Where the product may sit in each scene, leaving the top and bottom safe areas free for text and Instagram's UI. */
const BOX: Record<SceneKind, { cx: number; cy: number; w: number; h: number }> = {
  intro: { cx: W / 2, cy: 900, w: 1040, h: 1180 },
  // Right of centre, so it differs from the centred opening and ending.
  showcase: { cx: 590, cy: 880, w: 940, h: 1200 },
  // Left of centre, so the feature labels can sit on the right.
  features: { cx: 470, cy: 840, w: 900, h: 1120 },
  gallery: { cx: 590, cy: 860, w: 940, h: 1160 },
  // Centred and fitted whole: the ending shows the full product.
  outro: { cx: W / 2, cy: 860, w: 1000, h: 1040 },
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The scene order for `photos` photos, and which photo each scene shows. The opening and the ending use the main photo. */
export function sceneLayout(photos: number): Array<{ kind: SceneKind; photo: number }> {
  const n = Math.max(1, photos);
  const middle: number[] = n >= 3 ? Array.from({ length: n - 1 }, (_, j) => j + 1) : n === 2 ? [1, 1] : [0, 0];
  const kinds: SceneKind[] = ['showcase', 'features'];
  return [
    { kind: 'intro', photo: 0 },
    ...middle.map((photo, j) => ({ kind: kinds[j] ?? ('gallery' as const), photo })),
    { kind: 'outro', photo: 0 },
  ];
}

/**
 * The scene plan: an opening, one or more middle scenes and an ending. Each scene uses a different backdrop light,
 * camera move and product position, so consecutive scenes always differ. `stages` holds the product layer size per
 * photo; an entry is null when an AI scene already contains the product.
 */
export function planScenes(opts: { duration: number; level: AnimationLevel; stage?: { width: number; height: number } | null; stages?: Array<{ width: number; height: number } | null> }): Plan {
  const L = LEVEL[opts.level];
  const k = L.k;
  const T = L.transition;
  const stages = opts.stages ?? [opts.stage ?? null];
  const layout = sceneLayout(stages.length);
  // The opening and the ending take 20% each; the middle scenes share the rest.
  const share = (kind: SceneKind) => (kind === 'intro' || kind === 'outro' ? 0.2 : 0.6 / (layout.length - 2));
  let start = 0;
  const scenes = layout.map(({ kind, photo }, i): ScenePlan => {
    const d = round(i === layout.length - 1 ? opts.duration - start : opts.duration * share(kind));
    const s = start;
    start = round(start + d);
    const last = i === layout.length - 1;
    const stage = stages[photo] ?? null;
    const fit = stage ? Math.min(BOX[kind].w / stage.width, BOX[kind].h / stage.height) : 1;
    const box = BOX[kind];
    // Alternate the side of repeated middle scenes.
    const flip = kind === 'gallery' && i % 2 === 0 ? -1 : 1;
    let camera: CameraMove;
    let product: ProductMove | null = null;
    switch (kind) {
      case 'intro':
        camera = { z0: 1.04, z1: 1.04 + 0.05 * k, px0: 0, px1: 0, py0: 0, py1: -0.2 * k };
        if (stage) product = { s0: fit * 0.92, s1: fit * (0.92 + 0.05 * k), cx0: box.cx, cx1: box.cx, cy: box.cy, entrance: { from: Math.round(220 * k), at: 0.1, dur: 0.9 } };
        break;
      case 'showcase':
        // Close-up: the product is large and drifts while the backdrop drifts the other way (parallax).
        camera = { z0: 1.1, z1: 1.1 + 0.05 * k, px0: 0.5 * k, px1: -0.5 * k, py0: 0, py1: 0 };
        if (stage) product = { s0: fit * 1.0, s1: fit * (1 + 0.07 * k), cx0: box.cx - 30 * k, cx1: box.cx + 30 * k, cy: box.cy, entrance: null };
        break;
      case 'features':
        // A pull-back with a pan the other way: a clearly different composition.
        camera = { z0: 1.12 + 0.04 * k, z1: 1.06, px0: -0.6 * k, px1: 0.6 * k, py0: 0.3, py1: 0.1 };
        if (stage) product = { s0: fit * (1 + 0.06 * k), s1: fit * 0.96, cx0: box.cx + 30 * k, cx1: box.cx - 30 * k, cy: box.cy, entrance: null };
        break;
      case 'gallery':
        camera = { z0: 1.08, z1: 1.08 + 0.04 * k, px0: 0.4 * k * flip, px1: -0.4 * k * flip, py0: 0.1, py1: -0.1 };
        if (stage) {
          const cx = flip === 1 ? box.cx : W - box.cx;
          product = { s0: fit * 0.98, s1: fit * (0.98 + 0.05 * k), cx0: cx - 30 * k * flip, cx1: cx + 30 * k * flip, cy: box.cy, entrance: null };
        }
        break;
      case 'outro':
        camera = { z0: 1.08, z1: 1.03, px0: 0, px1: 0, py0: 0.2, py1: 0 };
        if (stage) product = { s0: fit * 0.96, s1: fit, cx0: box.cx, cx1: box.cx, cy: box.cy, entrance: null };
        break;
    }
    // An AI scene already holds the whole product, filling the frame. Zooming in like a cut-out would crop it, so the
    // camera only drifts. The ending sits still at the widest framing so the whole product shows.
    if (!stage) camera = kind === 'outro' ? { z0: 1.02, z1: 1.02, px0: 0, px1: 0, py0: 0, py1: 0 } : gentle(camera);
    return {
      kind,
      photo,
      start: s,
      end: start,
      length: round(d + (last ? 0 : T)),
      variant: (i % 4) as 0 | 1 | 2 | 3,
      camera: clampCamera(camera),
      product,
      sweepAt: kind === 'showcase' ? round(Math.min(0.6, d * 0.2)) : kind === 'outro' ? round(Math.min(0.9, d * 0.4)) : null,
      transition: last ? null : L.transitions[i % 3]!,
    };
  });
  return { duration: opts.duration, transition: T, scenes, k, particles: L.particles };
}

/** Keeps a camera move but shrinks its zoom (to 30%) and pan (to 35%). */
function gentle(c: CameraMove): CameraMove {
  const z = (v: number) => 1 + (v - 1) * 0.3;
  return { z0: z(c.z0), z1: z(c.z1), px0: c.px0 * 0.35, px1: c.px1 * 0.35, py0: c.py0 * 0.35, py1: c.py1 * 0.35 };
}

function clampCamera(c: CameraMove): CameraMove {
  const z = (v: number) => Math.min(1.3, Math.max(1.02, v));
  const p = (v: number) => Math.min(1, Math.max(-1, v));
  return { z0: z(c.z0), z1: z(c.z1), px0: p(c.px0), px1: p(c.px1), py0: p(c.py0), py1: p(c.py1) };
}

/** Product area on screen (as a share of the frame) at the scene's smallest scale. */
export function productShare(scene: ScenePlan, stage: { productWidth: number; productHeight: number }, coverage: number): number {
  if (!scene.product) return 1;
  const s = Math.min(scene.product.s0, scene.product.s1);
  return (stage.productWidth * s * stage.productHeight * s * coverage) / (W * H);
}

/** Text safe area: Instagram covers roughly the top 220 px and bottom 340 px. */
export const SAFE = { top: 220, bottom: H - 340 };
