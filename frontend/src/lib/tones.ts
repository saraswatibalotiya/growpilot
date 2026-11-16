/** Writing tones the owner picks for each post or reel. Must match TONES in backend/src/common/constants.ts. There is no default tone: the owner always chooses. The labels are in each language's tones.json. */
export const TONES = ['professional', 'trendy', 'friendly', 'luxury', 'promotional', 'storytelling', 'funny', 'minimal', 'festive', 'influencer', 'elegant', 'local'] as const
export type Tone = (typeof TONES)[number]

/** Caption size and hashtag count. Match the backend constants. `medium` is pre-selected, and the owner can change it. */
export const CAPTION_LENGTHS = ['short', 'medium', 'long'] as const
export type CaptionLength = (typeof CAPTION_LENGTHS)[number]
export const DEFAULT_CAPTION_LENGTH: CaptionLength = 'medium'

export const HASHTAG_LEVELS = ['few', 'medium', 'many'] as const
export type HashtagLevel = (typeof HASHTAG_LEVELS)[number]
export const DEFAULT_HASHTAG_LEVEL: HashtagLevel = 'medium'
