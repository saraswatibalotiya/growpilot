import { z } from 'zod';
import { LANGUAGES, type Language } from '../common/constants';

/** Runtime schemas for everything the model returns. Nothing reaches the frontend without passing one. */

const LanguageSchema = z.enum(LANGUAGES);
export type { Language };

const INTENTS = ['CREATE', 'EDIT', 'REGENERATE', 'PUBLISH', 'CANCEL', 'ASK_QUESTION'] as const;
const IntentSchema = z.enum(INTENTS);

/** Poster identifiers the renderer supports. Anything else the model invents is rejected. */
export const POSTER_TEMPLATES = ['boutique_new_arrival_01', 'boutique_special_offer_01'] as const;
export const POSTER_THEMES = ['elegant', 'festive', 'bold', 'minimal'] as const;
export const POSTER_LAYOUTS = ['product_center', 'product_left', 'product_bottom'] as const;

// ---- Haiku ----

const EntitiesSchema = z.object({
  productName: z.string().nullable(),
  /** Only a price the owner actually said. Digits only, for example "899". */
  price: z.string().nullable(),
  /** Only a discount or offer the owner actually said, in their words. */
  discount: z.string().nullable(),
  tone: z.string().nullable(),
});
export type Entities = z.infer<typeof EntitiesSchema>;

export const IntentResultSchema = z.object({
  intent: IntentSchema,
  confidence: z.number(),
  language: LanguageSchema.nullable(),
  entities: EntitiesSchema,
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

const EDIT_OPERATIONS = [
  'SHORTEN',
  'CHANGE_LANGUAGE',
  'REMOVE_PRICE',
  'SET_PRICE',
  'MORE_ATTRACTIVE',
  'FESTIVE',
  'CHANGE_CTA',
  'PREMIUM_TONE',
  'FRIENDLY_TONE',
  'SIMPLIFY',
  'NEW_HASHTAGS',
  'OTHER',
] as const;

export const EditPlanSchema = z.object({
  operations: z.array(z.enum(EDIT_OPERATIONS)),
  targetLanguage: LanguageSchema.nullable(),
  /** A price the owner explicitly gave in this instruction, digits only. */
  newPrice: z.string().nullable(),
  /** True when the instruction can't be turned into a safe edit and needs a question first. */
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
});
export type EditPlan = z.infer<typeof EditPlanSchema>;

export const ConversationSummarySchema = z.object({
  businessAndProduct: z.string(),
  currentIntent: z.string(),
  draftStatus: z.string(),
  confirmedFacts: z.array(z.string()),
  ownerPreferences: z.array(z.string()),
  pendingQuestions: z.array(z.string()),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// ---- Sonnet ----

export const ImageAnalysisSchema = z.object({
  /** What is visible, in plain words. null when nothing recognisable is visible. */
  productType: z.string().nullable(),
  colours: z.array(z.string()),
  positioning: z.string(),
  lighting: z.string(),
  background: z.string(),
  orientation: z.enum(['portrait', 'landscape', 'square', 'unknown']),
  quality: z.enum(['good', 'fair', 'poor']),
  recommendations: z.array(z.string()),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

const PosterSpecificationSchema = z.object({
  template: z.enum(POSTER_TEMPLATES),
  theme: z.enum(POSTER_THEMES),
  layout: z.enum(POSTER_LAYOUTS),
  headline: z.string(),
  priceText: z.string().nullable(),
  ctaText: z.string(),
});

export const ContentSchema = z.object({
  language: LanguageSchema,
  productUnderstanding: z.object({
    name: z.string().nullable(),
    category: z.string().nullable(),
    price: z.string().nullable(),
  }),
  headline: z.string(),
  caption: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  posterSpecification: PosterSpecificationSchema,
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
});
export type GeneratedContent = z.infer<typeof ContentSchema>;

export const EditedContentSchema = ContentSchema.extend({
  /** Short, plain list of what changed, for example "Shortened the caption". */
  changesApplied: z.array(z.string()),
});
export type EditedContent = z.infer<typeof EditedContentSchema>;
