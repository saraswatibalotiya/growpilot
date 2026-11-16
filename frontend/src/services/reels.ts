import { request } from '../lib/api'
import type { CaptionLength, HashtagLevel, Tone } from '../lib/tones'
import type { Page } from '../lib/types'

export type ReelLanguage = 'hi' | 'mr' | 'en'
export type ReelTemplate = 'SHOWCASE' | 'NEW_ARRIVALS' | 'SPECIAL_OFFER' | 'MINIMAL_PREMIUM'
export type ReelLook = 'AI_ENHANCE' | 'FULL_PHOTO' | 'AI_STUDIO' | 'AI_LIFESTYLE' | 'AI_LUXURY' | 'AI_FESTIVE' | 'AI_MINIMAL' | 'AI_OUTDOOR'
export type ReelStatus =
  | 'QUEUED'
  | 'WRITING_SCRIPT'
  | 'GENERATING_VOICE'
  | 'RENDERING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED'
  | 'APPROVED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'PUBLISH_FAILED'
export type ReelStage = 'UNDERSTANDING' | 'SCRIPT' | 'VOICEOVER' | 'SCENES' | 'RENDERING' | 'PREVIEW'
export type RegeneratePart = 'script' | 'voice' | 'video' | 'all'

export interface ReelScene {
  label: string
  text: string
  startSec: number
  endSec: number
}

export interface Reel {
  id: string
  businessId: string
  productId: string | null
  mediaAssetId: string | null
  sourceImageUrl: string
  language: ReelLanguage
  template: ReelTemplate
  look: ReelLook
  instruction: string | null
  tone: Tone
  captionLength: CaptionLength
  hashtagLevel: HashtagLevel
  productName: string
  price: string | null
  businessName: string
  offerText: string | null
  script: string | null
  scenes: ReelScene[]
  caption: string | null
  hashtags: string[]
  status: ReelStatus
  stage: ReelStage
  error: string | null
  voiceUrl: string | null
  videoUrl: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  stale: { script: boolean; voice: boolean; video: boolean }
  publishAmbiguous: boolean
  instagramMediaId: string | null
  permalink: string | null
  publishedAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReelStatusInfo {
  id: string
  status: ReelStatus
  stage: ReelStage
  error: string | null
  videoUrl: string | null
  thumbnailUrl: string | null
  updatedAt: string
}

export interface CreateReelInput {
  productId?: string
  mediaAssetId?: string
  /** Up to four more uploaded photos for the middle scenes. */
  extraMediaAssetIds?: string[]
  imageUrl?: string
  language: ReelLanguage
  template: ReelTemplate
  look?: ReelLook
  instruction?: string
  /** Required: the owner always picks the tone. */
  tone: Tone
  captionLength?: CaptionLength
  hashtagLevel?: HashtagLevel
  productName?: string
  price?: string
  offerText?: string
}

export interface UpdateReelInput {
  script?: string
  caption?: string
  hashtags?: string[]
  language?: ReelLanguage
  template?: ReelTemplate
  look?: ReelLook
  tone?: Tone
  captionLength?: CaptionLength
  hashtagLevel?: HashtagLevel
  instruction?: string
  productName?: string
  price?: string
  offerText?: string
}

export interface RegenerateInput {
  part: RegeneratePart
  shorter?: boolean
  tone?: Tone
  captionLength?: CaptionLength
  hashtagLevel?: HashtagLevel
}

export const createReel = (input: CreateReelInput) => request<Reel>('/reels', { method: 'POST', body: input })
export const listReels = (page = 1, limit = 12, signal?: AbortSignal) =>
  request<Page<Reel>>(`/reels?page=${page}&limit=${limit}`, { signal })
export const getReel = (id: string, signal?: AbortSignal) => request<Reel>(`/reels/${id}`, { signal })
export const getReelStatus = (id: string, signal?: AbortSignal) => request<ReelStatusInfo>(`/reels/${id}/status`, { signal })
export const updateReel = (id: string, input: UpdateReelInput) =>
  request<Reel & { changed: string[] }>(`/reels/${id}`, { method: 'PATCH', body: input })
export const regenerateReel = (id: string, input: RegenerateInput) =>
  request<Reel>(`/reels/${id}/regenerate`, { method: 'POST', body: input })
export const cancelReel = (id: string) => request<Reel>(`/reels/${id}/cancel`, { method: 'POST' })
export const approveReel = (id: string) => request<Reel>(`/reels/${id}/approve`, { method: 'POST' })
export const publishReel = (id: string) => request<Reel>(`/reels/${id}/publish`, { method: 'POST', body: { confirm: true } })

export interface AiUsage {
  available: boolean
  provider: string | null
  today: { date: string; used: number; limit: number | null; remaining: number | null; estimatedCostUsd: number }
}
export const getAiUsage = (signal?: AbortSignal) => request<AiUsage>('/media/ai-usage', { signal })
