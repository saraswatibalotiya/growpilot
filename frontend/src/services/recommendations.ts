import { translate } from '../i18n'
import { IDEAS, NOUN_CATEGORIES, type IdeaGroup, type IdeaTemplate } from '../mocks/recommendations'

/**
 * Recommendations for the owner. Returns mock data today; a future backend call replaces the body of
 * `getRecommendations` without touching any component. `category` is the business category if known.
 */
export interface RecommendedIdea {
  id: string
  group: IdeaGroup
  groupLabel: string
  icon: IdeaTemplate['icon']
  title: string
  description: string
  prompt: string
}

export interface RecommendationGroup {
  group: IdeaGroup
  label: string
  ideas: RecommendedIdea[]
}

function personalise(template: IdeaTemplate, noun: string): RecommendedIdea {
  const key = template.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
  return {
    id: template.id,
    group: template.group,
    groupLabel: translate(`ideas.groups.${template.group}`),
    icon: template.icon,
    title: translate(`ideas.items.${key}.title`),
    description: translate(`ideas.items.${key}.description`),
    prompt: translate(`ideas.items.${key}.prompt`, { noun }),
  }
}

function nounFor(category: string | null | undefined): string {
  return translate(`ideas.nouns.${category && NOUN_CATEGORIES.includes(category) ? category : 'generic'}`)
}

/** Ideas for the home dashboard: the featured five, in order. */
export async function getFeaturedIdeas(category?: string | null): Promise<RecommendedIdea[]> {
  const noun = nounFor(category)
  return IDEAS.filter((i) => i.featured).map((i) => personalise(i, noun))
}

/** Every idea, grouped by category, for the Recommendations page. */
export async function getRecommendationGroups(category?: string | null): Promise<RecommendationGroup[]> {
  const noun = nounFor(category)
  const order: IdeaGroup[] = ['product', 'sales', 'engagement', 'education', 'festival', 'growth']
  return order.map((group) => ({
    group,
    label: translate(`ideas.groups.${group}`),
    ideas: IDEAS.filter((i) => i.group === group).map((i) => personalise(i, noun)),
  }))
}
