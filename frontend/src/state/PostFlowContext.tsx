import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_CAPTION_LENGTH, DEFAULT_HASHTAG_LEVEL, type CaptionLength, type HashtagLevel, type Tone } from '../lib/tones'
import type { GeneratedContent, Language, Post } from '../lib/types'

/** The post being made, shared across the create, preview, publish and done screens. */
export interface PostDraft {
  /** Carousel photos in order (max 10). The first is the cover. */
  photoUrls: string[]
  /** Cover photo: the first of photoUrls. */
  photoUrl: string | null
  transcript: string
  language: Language
  /** The writing tone picked for this post. Null until the owner chooses one. */
  tone: Tone | null
  captionLength: CaptionLength
  hashtagLevel: HashtagLevel
  inputSource: 'voice' | 'text'
  productId: string | null
  conversationId: string | null
  post: Post | null
  content: GeneratedContent | null
  published: Post | null
  /** Notes from the AI (for example a photo it couldn't read). */
  aiNotes: string[]
}

const EMPTY: PostDraft = {
  photoUrls: [],
  photoUrl: null,
  transcript: '',
  language: 'en',
  tone: null,
  captionLength: DEFAULT_CAPTION_LENGTH,
  hashtagLevel: DEFAULT_HASHTAG_LEVEL,
  inputSource: 'voice',
  productId: null,
  conversationId: null,
  post: null,
  content: null,
  published: null,
  aiNotes: [],
}

interface PostFlowValue {
  draft: PostDraft
  update: (changes: Partial<PostDraft>) => void
  reset: (language?: Language) => void
}

const PostFlowContext = createContext<PostFlowValue | null>(null)

export function PostFlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<PostDraft>(EMPTY)
  // update and reset keep the same identity across renders, so effects that list them as dependencies don't loop.
  const update = useCallback((changes: Partial<PostDraft>) => setDraft((d) => ({ ...d, ...changes })), [])
  const reset = useCallback((language?: Language) => setDraft({ ...EMPTY, language: language ?? EMPTY.language }), [])
  const value = useMemo<PostFlowValue>(() => ({ draft, update, reset }), [draft, update, reset])
  return <PostFlowContext.Provider value={value}>{children}</PostFlowContext.Provider>
}

export function usePostFlow(): PostFlowValue {
  const ctx = useContext(PostFlowContext)
  if (!ctx) throw new Error('usePostFlow must be used inside PostFlowProvider')
  return ctx
}
