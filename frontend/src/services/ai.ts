import { request } from '../lib/api'
import { translate } from '../i18n'
import type { CaptionLength, HashtagLevel, Tone } from '../lib/tones'
import type { GeneratedContent, Language, PosterSpecification } from '../lib/types'

// Shapes mirror backend/src/ai (dto/ai.dto.ts and ai-orchestrator.service.ts). All calls go through the
// authenticated API client; Claude is only ever called by the backend.

interface ClarificationResponse {
  requiresClarification: true
  clarificationQuestion: string
  language: Language
  postId: string | null
  postStatus: string | null
  warnings: string[]
}

interface ContentFields {
  language: Language
  headline: string
  caption: string
  callToAction: string
  hashtags: string[]
  posterSpecification: PosterSpecification
  requiresClarification: false
  postId: string | null
  postStatus: string | null
  warnings: string[]
  promptVersion: string
  /** True when an earlier answer for the same photo and words was reused (no AI request was made). */
  reused?: boolean
}

interface GenerateResponse extends ContentFields {
  productUnderstanding: { name: string | null; category: string | null; price: string | null }
}

interface EditResponse extends ContentFields {
  changesApplied: string[]
}

/** Either the owner needs to answer a question first, or there is content. */
export type AiOutcome = { clarification: string } | { content: GeneratedContent; language: Language; warnings: string[]; notes: string[]; postStatus: string | null }

export interface GenerateArgs {
  conversationId: string
  postId: string
  transcript: string
  language: Language
  tone: Tone
  captionLength?: CaptionLength
  hashtagLevel?: HashtagLevel
  productId?: string
  /** The cover photo. Must be one uploaded through /media/upload. */
  imageUrl?: string
}

export async function generateContent(args: GenerateArgs): Promise<AiOutcome> {
  const res = await request<GenerateResponse | ClarificationResponse>('/ai/generate-content', { method: 'POST', body: args })
  if (res.requiresClarification) return { clarification: res.clarificationQuestion }
  return {
    content: {
      headline: res.headline,
      caption: res.caption,
      callToAction: res.callToAction,
      hashtags: res.hashtags,
      productName: res.productUnderstanding.name,
      price: res.productUnderstanding.price,
      posterSpecification: res.posterSpecification,
      source: 'ai',
    },
    language: res.language,
    warnings: res.reused ? [...res.warnings, translate('post.ai.reused')] : res.warnings,
    notes: [],
    postStatus: res.postStatus,
  }
}

/** Edits the existing draft in place (same post, same conversation). Returns the complete updated draft. */
export async function editContent(conversationId: string, postId: string, instruction: string, previous: GeneratedContent): Promise<AiOutcome> {
  const res = await request<EditResponse | ClarificationResponse>('/ai/edit-content', { method: 'POST', body: { conversationId, postId, instruction } })
  if (res.requiresClarification) return { clarification: res.clarificationQuestion }
  return {
    content: {
      ...previous,
      headline: res.headline,
      caption: res.caption,
      callToAction: res.callToAction,
      hashtags: res.hashtags,
      posterSpecification: res.posterSpecification,
      source: 'ai',
    },
    language: res.language,
    warnings: res.warnings,
    notes: res.changesApplied,
    postStatus: res.postStatus,
  }
}
