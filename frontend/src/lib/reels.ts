import { translate } from '../i18n'
import { ApiError } from './api'
import type { ReelLanguage, ReelLook, ReelStage, ReelStatus, ReelTemplate, RegeneratePart, Reel } from '../services/reels'

export const REEL_SECONDS = 10

export const REEL_LANGUAGES: { code: ReelLanguage; labelKey: string; native: string }[] = [
  { code: 'hi', labelKey: 'reels.languages.hi', native: 'हिन्दी' },
  { code: 'mr', labelKey: 'reels.languages.mr', native: 'मराठी' },
  { code: 'en', labelKey: 'reels.languages.en', native: 'English' },
]

export const REEL_LOOKS: { id: ReelLook; ai: boolean }[] = [
  { id: 'AI_ENHANCE', ai: true },
  { id: 'FULL_PHOTO', ai: false },
  { id: 'AI_STUDIO', ai: true },
  { id: 'AI_LIFESTYLE', ai: true },
  { id: 'AI_LUXURY', ai: true },
  { id: 'AI_FESTIVE', ai: true },
  { id: 'AI_MINIMAL', ai: true },
  { id: 'AI_OUTDOOR', ai: true },
]

export const STAGES: { stage: ReelStage }[] = [
  { stage: 'UNDERSTANDING' },
  { stage: 'SCRIPT' },
  { stage: 'SCENES' },
  { stage: 'RENDERING' },
  { stage: 'PREVIEW' },
]

export const stageIndex = (stage: ReelStage): number => Math.max(0, STAGES.findIndex((s) => s.stage === stage))

const BUSY: ReelStatus[] = ['QUEUED', 'WRITING_SCRIPT', 'GENERATING_VOICE', 'RENDERING']

export const isBuilding = (status: ReelStatus): boolean => BUSY.includes(status)
export const isTerminal = (status: ReelStatus): boolean => !isBuilding(status)

export const STATUS_LABEL: Record<ReelStatus, { tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  QUEUED: { tone: 'neutral' },
  WRITING_SCRIPT: { tone: 'neutral' },
  GENERATING_VOICE: { tone: 'neutral' },
  RENDERING: { tone: 'neutral' },
  READY: { tone: 'neutral' },
  FAILED: { tone: 'danger' },
  CANCELLED: { tone: 'neutral' },
  APPROVED: { tone: 'warning' },
  PUBLISHING: { tone: 'warning' },
  PUBLISHED: { tone: 'success' },
  PUBLISH_FAILED: { tone: 'danger' },
}

export interface TemplateMeta {
  id: ReelTemplate
}

export const TEMPLATES: TemplateMeta[] = [
  { id: 'SHOWCASE' },
  { id: 'NEW_ARRIVALS' },
  { id: 'SPECIAL_OFFER' },
  { id: 'MINIMAL_PREMIUM' },
]

export const templateName = (t: ReelTemplate): string => TEMPLATES.some((x) => x.id === t) ? translate(`reels.templates.${t}.name`) : t

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Which regenerate part brings a stale reel up to date. */
export function staleFix(reel: Reel): { part: RegeneratePart; label: string } | null {
  if (reel.stale.script) return { part: 'script', label: translate('reels.stale.script') }
  if (reel.stale.video) return { part: 'video', label: translate('reels.stale.video') }
  return null
}

export const isStale = (reel: Reel): boolean => reel.stale.script || reel.stale.video

export function publishErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return translate('reels.publishError.off')
    if (error.status === 409) return error.message || translate('reels.publishError.conflict')
    return error.message
  }
  return translate('reels.publishError.generic')
}
