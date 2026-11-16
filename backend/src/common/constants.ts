/** Supported content languages: hi = Hindi, mr = Marathi, en = English. Matches the BusinessLanguage enum in prisma/schema.prisma. */
export const LANGUAGES = ['hi', 'mr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Must match the BusinessCategory enum in prisma/schema.prisma. `other` covers anything else. */
export const BUSINESS_CATEGORIES = ['clothing', 'jewellery', 'grocery', 'footwear', 'other'] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];
/** Categories an owner can pick while onboarding (`other` is only set by the system). */
export const ONBOARDING_CATEGORIES = ['clothing', 'jewellery', 'grocery', 'footwear'] as const;
export type OnboardingCategory = (typeof ONBOARDING_CATEGORIES)[number];

/** How long a caption is. The owner picks one per post or reel; `medium` is pre-selected in the app. */
export const CAPTION_LENGTHS = ['short', 'medium', 'long'] as const;
export type CaptionLength = (typeof CAPTION_LENGTHS)[number];
export const DEFAULT_CAPTION_LENGTH: CaptionLength = 'medium';

/** How many hashtags to write. The owner picks one per post or reel; `medium` is pre-selected in the app. */
export const HASHTAG_LEVELS = ['few', 'medium', 'many'] as const;
export type HashtagLevel = (typeof HASHTAG_LEVELS)[number];
export const DEFAULT_HASHTAG_LEVEL: HashtagLevel = 'medium';
export const HASHTAG_COUNTS: Record<HashtagLevel, { min: number; max: number }> = {
  few: { min: 3, max: 4 },
  medium: { min: 5, max: 7 },
  many: { min: 10, max: 12 },
};

/** The writing tones an owner can pick for each post or reel. There is no default: the owner always chooses. The labels are in the frontend locale files. */
export const TONES = ['professional', 'trendy', 'friendly', 'luxury', 'promotional', 'storytelling', 'funny', 'minimal', 'festive', 'influencer', 'elegant', 'local'] as const;
export type Tone = (typeof TONES)[number];

/** Matches the MessageRole enum in prisma/schema.prisma. */
export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Matches the UserStatus enum in prisma/schema.prisma. */
export const USER_STATUS = { Active: 'active', Disabled: 'disabled' } as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
