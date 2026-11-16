import type { VisualStyle } from '../media/studio/image-editing.provider';

export { LANGUAGES as REEL_LANGUAGES } from '../common/constants';
export type { Language as ReelLanguage } from '../common/constants';

export const REEL_TEMPLATES = ['SHOWCASE', 'NEW_ARRIVALS', 'SPECIAL_OFFER', 'MINIMAL_PREMIUM'] as const;
export type ReelTemplate = (typeof REEL_TEMPLATES)[number];

/** How the product photo fills the Reel. FULL_PHOTO is free; AI_* asks Gemini for a full-screen background scene (cached per photo). */
export const REEL_LOOKS = ['AI_ENHANCE', 'FULL_PHOTO', 'AI_STUDIO', 'AI_LIFESTYLE', 'AI_LUXURY', 'AI_FESTIVE', 'AI_MINIMAL', 'AI_OUTDOOR'] as const;
export type ReelLook = (typeof REEL_LOOKS)[number];

/**
 * Which Gemini edit each AI look uses. AI_ENHANCE is the basic one: the same photo and background, tidied, with the
 * product filling the screen. It is the default whenever Gemini is available.
 */
export const LOOK_STYLE: Record<Exclude<ReelLook, 'FULL_PHOTO'>, VisualStyle> = {
  AI_ENHANCE: 'enhance',
  AI_STUDIO: 'studio',
  AI_LIFESTYLE: 'lifestyle',
  AI_LUXURY: 'luxury',
  AI_FESTIVE: 'festive',
  AI_MINIMAL: 'minimal',
  AI_OUTDOOR: 'outdoor',
};

/** Studio backdrops drawn by the composer (no AI, no cost). */
export const BACKGROUND_STYLES = ['BEIGE_STUDIO', 'CREAM_GRADIENT', 'WHITE_STUDIO', 'LUXURY_DARK'] as const;
export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number];
/** Plain white by default: a beige backdrop made Reels and posters look dated. */
export const DEFAULT_BACKGROUND: BackgroundStyle = 'WHITE_STUDIO';

/** How much the camera, product and text move. */
export const ANIMATION_LEVELS = ['SUBTLE', 'BALANCED', 'DYNAMIC'] as const;
export type AnimationLevel = (typeof ANIMATION_LEVELS)[number];

export const TEXT_STYLES = ['CLASSIC', 'MODERN', 'BOLD'] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

/** Background music synthesised by FFmpeg (royalty-free). */
export const MUSIC_TRACKS = ['NONE', 'CALM', 'UPBEAT', 'ELEGANT'] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];

export const REEL_DURATIONS = [10, 15, 30] as const;
export type ReelDuration = (typeof REEL_DURATIONS)[number];

export const REEL_STATUSES = ['QUEUED', 'WRITING_SCRIPT', 'GENERATING_VOICE', 'RENDERING', 'READY', 'FAILED', 'CANCELLED', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED'] as const;
export type ReelStatus = (typeof REEL_STATUSES)[number];

export const REEL_STAGES = ['UNDERSTANDING', 'SCRIPT', 'VOICEOVER', 'SCENES', 'RENDERING', 'PREVIEW'] as const;
export type ReelStage = (typeof REEL_STAGES)[number];

export const REGENERATE_PARTS = ['script', 'voice', 'video', 'all'] as const;
export type RegeneratePart = (typeof REGENERATE_PARTS)[number];

/** Statuses where a background job is running (or should be). */
export const JOB_STATUSES: readonly ReelStatus[] = ['QUEUED', 'WRITING_SCRIPT', 'GENERATING_VOICE', 'RENDERING'];
/** Statuses the owner may edit or regenerate from. */
export const EDITABLE_STATUSES: readonly ReelStatus[] = ['READY', 'APPROVED', 'FAILED'];
export const REGENERATABLE_STATUSES: readonly ReelStatus[] = ['READY', 'APPROVED', 'FAILED', 'CANCELLED'];

/** Default Reel length. */
export const REEL_SECONDS = 10;

/** Photos one Reel can use: the main one plus up to four more. */
export const MAX_REEL_PHOTOS = 5;

export interface ReelScene {
  label: string;
  text: string;
  startSec: number;
  endSec: number;
}
