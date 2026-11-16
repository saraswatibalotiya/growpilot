// Types mirror the backend responses. Keep them in sync with backend DTOs.

export type Language = 'hi' | 'mr' | 'en'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
}

export interface SessionUser {
  id: string
  name: string
  email: string
}

export interface BusinessProfile {
  id: string
  name: string
  category: string
  preferredLanguage: Language | null
  supportedLanguages: Language[] | null
  description: string | null
  city: string | null
  area: string | null
  targetAudience: string | null
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  businessId: string
  name: string
  description: string | null
  category: string | null
  price: string | null
  currency: string
  imageUrl: string | null
  isAvailable: boolean
  createdAt: string
  updatedAt: string
}

export type PostStatus =
  | 'DRAFT'
  | 'CONTENT_GENERATED'
  | 'PREVIEW_READY'
  | 'USER_APPROVED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'

export interface Post {
  id: string
  businessId: string
  conversationId: string | null
  productId: string | null
  originalImageUrl: string | null
  /** True when the Instagram post was archived or deleted (from the last full sync). */
  removedFromInstagram?: boolean
  /** Carousel photos in order. The first is the cover. */
  images?: { position: number; imageUrl: string }[]
  posterImageUrl: string | null
  caption: string | null
  headline: string | null
  callToAction: string | null
  hashtags: string[] | null
  language: Language | null
  status: PostStatus
  instagramMediaId: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Page<T> {
  items: T[]
  page: number
  limit: number
  hasMore: boolean
}

export interface MediaAsset {
  id: string
  businessId: string
  secureUrl: string
  mimeType: string
  width: number | null
  height: number | null
  bytes: number
  createdAt: string
}

export interface InstagramAccount {
  id: string
  businessId: string
  platformAccountId: string
  username: string | null
  displayName: string | null
  accountType: string | null
  status: 'connected' | 'expired' | 'error' | 'disconnected'
  isMock: boolean
  followerCount: number | null
  postCount: number | null
}

export interface Conversation {
  id: string
  businessId: string
  status: 'active' | 'closed'
}

/** What the AI step returns. `source` says where it came from, so the UI never presents demo content as real. */
export interface GeneratedContent {
  headline: string
  caption: string
  callToAction: string
  hashtags: string[]
  productName: string | null
  price: string | null
  /** What the AI proposes for the poster. Not saved by the backend yet. */
  posterSpecification?: PosterSpecification
  source: 'ai' | 'demo'
}

export interface PosterSpecification {
  template: string
  theme: string
  layout: string
  headline: string
  priceText: string | null
  ctaText: string
}
