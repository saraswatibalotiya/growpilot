import sharp from 'sharp';
import type { BackgroundStyle } from '../reels.constants';

export const W = 1080;
export const H = 1920;
/** Backgrounds are drawn larger than the frame so the camera can zoom and pan without showing an edge. */
export const BG_SCALE = 1.15;
export const BW = Math.round(W * BG_SCALE);
export const BH = Math.round(H * BG_SCALE);

export interface StudioPalette {
  top: string;
  bottom: string;
  floor: string;
  /** Spotlight colour and strength. */
  spot: string;
  spotOpacity: number;
  vignette: number;
  /** Title and body text colours that read on this backdrop. */
  ink: string;
  sub: string;
  dark: boolean;
  /** Mirror reflection under the product (clean, glossy floors only). */
  reflection: boolean;
  /** Floating particle colour. */
  particle: string;
}

export const PALETTES: Record<BackgroundStyle, StudioPalette> = {
  BEIGE_STUDIO: { top: '#F1E6D6', bottom: '#DCC8AD', floor: '#CDB494', spot: '#FFF8EC', spotOpacity: 0.7, vignette: 0.16, ink: '#2B2118', sub: '#6A5642', dark: false, reflection: false, particle: '#C9A36A' },
  CREAM_GRADIENT: { top: '#FCF7EE', bottom: '#F0DCC0', floor: '#E8CFAE', spot: '#FFFFFF', spotOpacity: 0.65, vignette: 0.1, ink: '#33251A', sub: '#7A6247', dark: false, reflection: false, particle: '#D7B27A' },
  WHITE_STUDIO: { top: '#FFFFFF', bottom: '#EEEEEE', floor: '#E4E4E4', spot: '#FFFFFF', spotOpacity: 0.8, vignette: 0.1, ink: '#1B1B1B', sub: '#5C5C5C', dark: false, reflection: true, particle: '#B9B9B9' },
  LUXURY_DARK: { top: '#2B2420', bottom: '#0D0A09', floor: '#1A1512', spot: '#E9C89A', spotOpacity: 0.32, vignette: 0.55, ink: '#F7EFE4', sub: '#CDBDA8', dark: true, reflection: true, particle: '#E9C89A' },
};

/**
 * One studio backdrop. `variant` changes the light per scene so consecutive scenes look different:
 * 0 centred spotlight, 1 spotlight from the left with a warmer floor, 2 diagonal light beams with shadow bands, 3 hero spotlight.
 */
export function studioSvg(style: BackgroundStyle, variant: 0 | 1 | 2 | 3): string {
  const p = PALETTES[style];
  const horizon = 0.66;
  const spotX = [0.5, 0.32, 0.62, 0.5][variant]!;
  const spotY = [0.4, 0.36, 0.34, 0.42][variant]!;
  const spotR = [0.62, 0.55, 0.5, 0.7][variant]!;
  const beams =
    variant === 2
      ? `<g opacity="${p.dark ? 0.16 : 0.42}" filter="url(#soft)">` +
        [0.12, 0.38, 0.64]
          .map((x, i) => `<polygon points="${BW * x},0 ${BW * (x + 0.12)},0 ${BW * (x + 0.34 + i * 0.02)},${BH} ${BW * (x + 0.18)},${BH}" fill="${p.spot}"/>`)
          .join('') +
        `</g><g opacity="${p.dark ? 0.35 : 0.08}" filter="url(#soft)"><polygon points="${BW * 0.26},0 ${BW * 0.36},0 ${BW * 0.58},${BH} ${BW * 0.44},${BH}" fill="#000"/></g>`
      : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BW}" height="${BH}">` +
    `<defs>` +
    `<linearGradient id="base" x1="0" y1="0" x2="${style === 'CREAM_GRADIENT' ? 0.6 : 0}" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient>` +
    `<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.floor}" stop-opacity="0"/><stop offset="0.18" stop-color="${p.floor}" stop-opacity="${variant === 1 ? 0.95 : 0.8}"/><stop offset="1" stop-color="${p.floor}"/></linearGradient>` +
    `<radialGradient id="spot" cx="${spotX}" cy="${spotY}" r="${spotR}"><stop offset="0" stop-color="${p.spot}" stop-opacity="${p.spotOpacity}"/><stop offset="0.55" stop-color="${p.spot}" stop-opacity="${p.spotOpacity * 0.25}"/><stop offset="1" stop-color="${p.spot}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${p.vignette}"/></radialGradient>` +
    `<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="40"/></filter>` +
    `</defs>` +
    `<rect width="${BW}" height="${BH}" fill="url(#base)"/>` +
    `<rect y="${BH * (horizon - 0.06)}" width="${BW}" height="${BH * (1 - horizon + 0.06)}" fill="url(#floor)"/>` +
    beams +
    `<rect width="${BW}" height="${BH}" fill="url(#spot)"/>` +
    `<rect width="${BW}" height="${BH}" fill="url(#vig)"/>` +
    `</svg>`
  );
}

export async function studioBackground(style: BackgroundStyle, variant: 0 | 1 | 2 | 3): Promise<Buffer> {
  return sharp(Buffer.from(studioSvg(style, variant))).png().toBuffer();
}

/** A soft light bloom that drifts slowly across the frame: the "animated gradient". */
export async function glowPng(style: BackgroundStyle): Promise<Buffer> {
  const p = PALETTES[style];
  const size = 1100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g"><stop offset="0" stop-color="${p.spot}" stop-opacity="${p.dark ? 0.22 : 0.35}"/><stop offset="1" stop-color="${p.spot}" stop-opacity="0"/></radialGradient></defs><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A soft diagonal band of light that slides across the frame. */
export const SWEEP_W = 520;
export async function lightSweepPng(strength = 0.26): Promise<Buffer> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SWEEP_W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="${strength}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
    `<polygon points="${SWEEP_W * 0.35},0 ${SWEEP_W},0 ${SWEEP_W * 0.65},${H} 0,${H}" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Sparse soft dots on a canvas twice the frame height; the halves match so scrolling loops seamlessly. */
export async function particlesPng(colour: string, count: number, seed = 7): Promise<Buffer> {
  let state = seed;
  const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (rand() * W).toFixed(0);
    const y = rand() * H;
    const r = (2 + rand() * 4).toFixed(1);
    const o = (0.12 + rand() * 0.25).toFixed(2);
    for (const dy of [0, H]) dots.push(`<circle cx="${x}" cy="${(y + dy).toFixed(0)}" r="${r}" fill="${colour}" fill-opacity="${o}" filter="url(#b)"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H * 2}"><defs><filter id="b"><feGaussianBlur stdDeviation="1.5"/></filter></defs>${dots.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * A soft dark fade across the top and bottom of an AI scene. The product fills such a scene, so text lands on it; the fade
 * gives every caption, price and call to action a darker area to sit on (the composer then picks white ink there).
 * Sizes are in backdrop pixels: the visible frame is the centre of the backdrop.
 */
export function plateScrimSvg(): Buffer {
  const oy = (BH - H) / 2;
  const topEnd = Math.round(oy + H * 0.28);
  const botStart = Math.round(oy + H * 0.5);
  // Many stops along an ease-out curve, so the fade has no visible edge.
  const stops = (points: Array<[number, number]>) => points.map(([o, a]) => `<stop offset="${o}" stop-color="#0B0B10" stop-opacity="${a}"/>`).join('');
  const top = stops([[0, 0.72], [0.2, 0.66], [0.4, 0.56], [0.6, 0.4], [0.8, 0.18], [0.92, 0.06], [1, 0]]);
  const bottom = stops([[0, 0], [0.1, 0.06], [0.25, 0.22], [0.45, 0.5], [0.65, 0.7], [0.85, 0.8], [1, 0.86]]);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BW}" height="${BH}"><defs>` +
      `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1">${top}</linearGradient>` +
      `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1">${bottom}</linearGradient>` +
      `</defs><rect x="0" y="0" width="${BW}" height="${topEnd}" fill="url(#t)"/><rect x="0" y="${botStart}" width="${BW}" height="${BH - botStart}" fill="url(#b)"/></svg>`,
  );
}
