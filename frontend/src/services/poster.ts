import { request } from '../lib/api'
import type { Post } from '../lib/types'

// Mirrors backend/src/poster. The poster is drawn on the server from the owner's real photo; the AI only designs.
export type PosterTemplateId = 'cover_card' | 'minimal_studio' | 'premium_editorial' | 'product_spotlight' | 'offer_poster'
export type PhotoTreatment = 'natural' | 'brighter' | 'vivid' | 'soft'
export type PricePosition = 'bottom-right' | 'bottom-left'
export type FontStyle = 'auto' | 'clean' | 'modern' | 'elegant' | 'bold' | 'friendly'

export interface PosterDesign {
  template: PosterTemplateId
  backgroundStyle: 'solid' | 'gradient'
  backgroundColor: string
  backgroundGradient: { from: string; to: string; direction: 'vertical' | 'diagonal' } | null
  photoTreatment: PhotoTreatment
  productAlignment: 'center' | 'left' | 'right'
  headline: string
  showHeadline: boolean
  headlinePosition: 'top' | 'bottom'
  showPrice: boolean
  pricePosition: PricePosition
  callToAction: string
  textColor: string
  accentColor: string
  fontStyle: FontStyle
}

export interface PosterTemplateOption {
  id: PosterTemplateId
  name: string
  summary: string
  needsOffer: boolean
  defaults: Pick<PosterDesign, 'backgroundStyle' | 'backgroundColor' | 'backgroundGradient' | 'photoTreatment' | 'textColor' | 'accentColor' | 'headlinePosition' | 'productAlignment'>
}

export interface PosterOptions {
  templates: PosterTemplateOption[]
}

interface PosterUsage {
  cached: boolean
  claude: { model: string; inputTokens: number; outputTokens: number } | null
  sharpMs: number
}

export interface PosterResult {
  poster: { id: string; url: string; width: number | null; height: number | null }
  design: PosterDesign
  /** The verified price (from the product record, or typed by the owner), whether or not the badge is on. Null when there is none. */
  price: { text: string; source: 'owner' | 'product' | null; shown: boolean } | null
  offer: string | null
  notes: string[]
  source: 'ai' | 'template' | 'owner'
  reasoning: string | null
  usage: PosterUsage
}

export type PosterEditResult = (PosterResult & { requiresClarification: false; changesApplied: string[] }) | { requiresClarification: true; clarificationQuestion: string; design: PosterDesign }

/** What identifies the photo and the facts. The price is never sent as a design field: it comes from the server. */
export interface PosterContext {
  imageUrl: string
  postId?: string
  productId?: string
  /** A price the owner typed. Without it the saved product's price is used, if there is one. */
  price?: string
  /** An offer the owner typed. The Offer Poster needs one. */
  offer?: string
  headline?: string
  callToAction?: string
  language?: 'hi' | 'mr' | 'en'
}

const clean = (c: PosterContext) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== ''))

export const getPosterOptions = () => request<PosterOptions>('/posters/options')

export const generatePoster = (context: PosterContext, template?: PosterTemplateId) =>
  request<PosterResult>('/posters/generate', { method: 'POST', body: { ...clean(context), ...(template ? { template } : {}) } })

export const renderPoster = (context: PosterContext, design: PosterDesign) =>
  request<PosterResult>('/posters/render', { method: 'POST', body: { ...clean(context), design } })

export const editPoster = (context: PosterContext, design: PosterDesign, instruction: string) =>
  request<PosterEditResult>('/posters/edit', { method: 'POST', body: { ...clean(context), design, instruction } })

export const savePoster = (posterId: string, postId: string) =>
  request<{ poster: PosterResult['poster']; post: Post }>(`/posters/${posterId}/save`, { method: 'POST', body: { postId } })
