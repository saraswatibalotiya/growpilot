/**
 * Per-category enhancement settings. Conservative on purpose: the goal is a clean, true-to-life photo, not a filter.
 * Any change here alters the processing key, so cached results for the old settings are not reused.
 */
export type ProductCategory = 'footwear' | 'clothing' | 'jewellery' | 'food' | 'beauty' | 'accessories' | 'home' | 'general';

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = ['footwear', 'clothing', 'jewellery', 'food', 'beauty', 'accessories', 'home', 'general'];

export interface EnhanceProfile {
  /** Largest overall brightening allowed (1 = none). Caps exposure correction so product colours stay real. */
  maxExposureGain: number;
  /** Largest per-channel white-balance correction (fraction). */
  maxWhiteBalance: number;
  /** Background luminance the exposure correction aims for (0..255). */
  targetBackground: number;
  /** Contrast boost around mid-grey (0 = none). */
  contrast: number;
  /** Saturation multiplier (1 = unchanged). Kept near 1: oversaturation misrepresents colour. */
  saturation: number;
  /** Unsharp mask strength. */
  sharpenSigma: number;
  /** Share of the canvas the product may fill on its limiting side. Lower = more breathing room. */
  productFill: number;
}

const BASE: EnhanceProfile = {
  maxExposureGain: 1.25,
  maxWhiteBalance: 0.12,
  targetBackground: 228,
  contrast: 0.06,
  saturation: 1.03,
  sharpenSigma: 0.7,
  productFill: 0.82,
};

const PROFILES: Record<ProductCategory, EnhanceProfile> = {
  general: BASE,
  footwear: { ...BASE, productFill: 0.8 },
  clothing: { ...BASE, productFill: 0.86, saturation: 1.02 },
  // Small, detailed items: more space around them, a little more crispness, no saturation change (metal tones).
  jewellery: { ...BASE, productFill: 0.7, sharpenSigma: 0.9, saturation: 1.0, maxExposureGain: 1.2 },
  food: { ...BASE, saturation: 1.06, contrast: 0.08 },
  beauty: { ...BASE, productFill: 0.75 },
  accessories: { ...BASE, productFill: 0.78 },
  home: { ...BASE, productFill: 0.85 },
};

export function profileFor(category: string | null | undefined): { category: ProductCategory; profile: EnhanceProfile } {
  const key = (category ?? '').toLowerCase() as ProductCategory;
  const found = PRODUCT_CATEGORIES.includes(key) ? key : 'general';
  return { category: found, profile: PROFILES[found] };
}

/** story is the 9:16 Reel frame; only used for AI Reel backgrounds. */
export type InstagramFormat = 'portrait' | 'square' | 'story';

/** Instagram feed sizes. 4:5 portrait is the default: it takes the most screen space in the feed. */
export const FORMATS: Record<InstagramFormat, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};
