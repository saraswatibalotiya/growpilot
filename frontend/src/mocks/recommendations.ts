// DEMO DATA. Stands in for a recommendation API that the backend does not provide yet.
// The UI never hardcodes these ideas; it reads them through services/recommendations.ts.
// Idea text lives in locales/*/ideas.json under ideas.items.<id in camelCase>; prompts use {noun}, filled in from the business category.

export type IdeaGroup =
  | 'product'
  | 'sales'
  | 'engagement'
  | 'education'
  | 'festival'
  | 'growth'

type IdeaIcon = 'bags' | 'tag' | 'star' | 'bulb' | 'party' | 'heart' | 'book' | 'gift' | 'trend' | 'calendar'

export interface IdeaTemplate {
  id: string
  group: IdeaGroup
  icon: IdeaIcon
  /** Shown on the home dashboard. Only the five entries flagged `featured` appear there. */
  featured?: boolean
}

/** Business categories that have a noun for prompts (ideas.nouns.<category>). */
export const NOUN_CATEGORIES = ['clothing', 'jewellery', 'grocery', 'footwear']

export const IDEAS: IdeaTemplate[] = [
  // Product promotions
  { id: 'new-arrivals', group: 'product', icon: 'bags', featured: true },
  { id: 'bestseller', group: 'product', icon: 'star' },
  { id: 'product-story', group: 'product', icon: 'heart' },

  // Sales and offers
  { id: 'announce-sale', group: 'sales', icon: 'tag', featured: true },
  { id: 'weekend-offer', group: 'sales', icon: 'gift' },
  { id: 'bundle-deal', group: 'sales', icon: 'tag' },

  // Customer engagement
  { id: 'happy-customer', group: 'engagement', icon: 'star', featured: true },
  { id: 'ask-opinion', group: 'engagement', icon: 'heart' },
  { id: 'behind-scenes', group: 'engagement', icon: 'heart' },

  // Educational content
  { id: 'quick-tip', group: 'education', icon: 'bulb', featured: true },
  { id: 'care-guide', group: 'education', icon: 'book' },
  { id: 'myth-busting', group: 'education', icon: 'bulb' },

  // Festivals and occasions
  { id: 'festival-wish', group: 'festival', icon: 'party', featured: true },
  { id: 'gift-guide', group: 'festival', icon: 'gift' },
  { id: 'season-launch', group: 'festival', icon: 'calendar' },

  // Business growth
  { id: 'visit-us', group: 'growth', icon: 'trend' },
  { id: 'milestone', group: 'growth', icon: 'trend' },
  { id: 'collab', group: 'growth', icon: 'heart' },
]
