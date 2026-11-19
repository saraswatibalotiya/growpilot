import type { AnalyticsReport, AudienceInsights, Recommendation, TrendAnalysis } from '../services/aiInsights'

export const AI_MOCK_INDUSTRIES = ['fashion', 'grooming', 'beauty', 'cafe'] as const
export type AiMockIndustry = typeof AI_MOCK_INDUSTRIES[number]

export interface AiMockDataset {
  analysis: AnalyticsReport
  audience: AudienceInsights
  trends: TrendAnalysis
  recommendations: Recommendation[]
}

interface Scenario {
  posts: number
  comments: number
  change: number
  recent: number
  weekly: number
  gap: number
  rate: number
  format: string
  topics: string[]
  questions: [string, string, string]
  trends: [string, string, string]
  ideas: [string, string][]
}

const scenarios: Record<AiMockIndustry, Scenario> = {
  fashion: {
    posts: 48, comments: 326, change: 0.24, recent: 1.38, weekly: 4, gap: 3, rate: 0.054, format: 'REEL',
    topics: ['Everyday styling', 'Capsule wardrobe', 'Size and fit'],
    questions: ['Does this come in other sizes?', 'Can you show three ways to style this?', 'Do you ship outside the city?'],
    trends: ['One outfit, three occasions', 'Build a capsule wardrobe', 'Behind the seams'],
    ideas: [
      ['Three looks, one linen shirt', 'Film a quick transition reel styling the same shirt for work, brunch, and an evening out. Show available sizes at the end.'],
      ['A real-fit size guide', 'Create a carousel showing the same outfit on different body types, with garment measurements and fit notes.'],
      ['Inside the new collection', 'Show fabric texture, stitching, and movement in natural light. Invite viewers to choose their favourite colour.'],
      ['Your capsule wardrobe picks', 'Share five versatile pieces and ask followers which combination they would wear first.'],
    ],
  },
  grooming: {
    posts: 24, comments: 142, change: -0.12, recent: 0.86, weekly: 1.8, gap: 12, rate: 0.032, format: 'REEL',
    topics: ['Beard shaping', 'Haircut maintenance', 'Appointments'],
    questions: ['How often should I trim my beard?', 'What is the price for a haircut and beard?', 'Are weekend appointments available?'],
    trends: ['Low-maintenance textured cuts', 'Beard-shaping transformations', 'At-home grooming routines'],
    ideas: [
      ['From grown-out to sharp', 'Film a before-and-after beard shaping with customer consent. Explain how face shape guides the trim.'],
      ['Keep your cut fresh for longer', 'Show three simple maintenance steps between visits, using tools customers already own.'],
      ['What is included in a grooming session?', 'Create a clear service carousel with timings, prices, and a booking call to action.'],
      ['Your barber answers', 'Answer the most common beard-trimming question in a short close-up demonstration.'],
    ],
  },
  beauty: {
    posts: 36, comments: 284, change: 0.08, recent: 1.14, weekly: 3, gap: 4, rate: 0.046, format: 'CAROUSEL',
    topics: ['Skin preparation', 'Everyday makeup', 'Shade matching'],
    questions: ['Is this suitable for sensitive skin?', 'How do I choose the right shade?', 'How long does the makeup last?'],
    trends: ['Skin-first makeup preparation', 'Daylight shade matching', 'Simple everyday makeup'],
    ideas: [
      ['A simple skin-prep checklist', 'Create a step-by-step carousel covering gentle preparation before makeup, without medical claims.'],
      ['Find your shade in daylight', 'Compare swatches in natural light across different skin tones and explain undertones.'],
      ['One look from day to evening', 'Show how to adapt an everyday makeup look with two small changes.'],
      ['Your sensitive-skin questions', 'Explain patch testing and ingredient checking, and recommend professional advice for persistent irritation.'],
    ],
  },
  cafe: {
    posts: 18, comments: 96, change: 0.03, recent: 1.02, weekly: 2, gap: 6, rate: 0.038, format: 'REEL',
    topics: ['Specialty coffee', 'Fresh bakes', 'Weekend brunch'],
    questions: ['Do you have oat milk?', 'What time does brunch start?', 'Is there seating for a small group?'],
    trends: ['Meet the morning bake', 'Coffee and pastry pairings', 'A neighbourhood brunch ritual'],
    ideas: [
      ['Your morning pour', 'Film the journey from fresh beans to a finished latte, ending with opening hours.'],
      ['Pick your pastry pairing', 'Pair three fresh bakes with drinks and invite followers to vote for their favourite.'],
      ['A seat for weekend brunch', 'Show the seating, menu highlights, and brunch timings in a short walkthrough.'],
      ['Beyond dairy', 'Show available milk alternatives and explain which drinks they pair well with.'],
    ],
  },
}

export function createAiMockDataset(industry: AiMockIndustry, now = new Date()): AiMockDataset {
  const s = scenarios[industry]
  const asOf = now.toISOString()
  const dateAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  return {
    analysis: {
      posts_analyzed: s.posts,
      baseline: { median_engagement_rate: s.rate, engagement_basis: 'reach', baseline_reliable: true },
      insights: [
        { key: 'engagement_trend', finding: `Sample engagement changed by ${Math.round(s.change * 100)}% over the previous period.`, supporting_metrics: { change: s.change }, confidence: 0.82, confidence_label: 'high' },
        { key: 'recent_performance', finding: 'Recent posts compared with the sample account baseline.', supporting_metrics: { recent_mean_index: s.recent, posts: 5 }, confidence: 0.78, confidence_label: 'high' },
        { key: 'consistency', finding: 'Sample posting rhythm over the analysis period.', supporting_metrics: { posts_per_week: s.weekly, longest_gap_days: s.gap }, confidence: 0.85, confidence_label: 'high' },
        { key: 'best_format', finding: `${s.format} leads this sample account.`, supporting_metrics: { best_format: s.format, best_median_rate: s.rate * 1.3 }, confidence: 0.74, confidence_label: 'medium' },
      ],
      top_posts: s.topics.map((topic, index) => ({
        media_id: `mock-${industry}-post-${index}`, permalink: null, posted_at: dateAgo(index * 3 + 1),
        format: index === 1 ? 'CAROUSEL' : s.format, topics: [topic], engagement_rate: s.rate * (1.6 - index * 0.2),
        performance_index: 1.6 - index * 0.2, index_basis: 'median_engagement_rate',
      })),
      warnings: [],
    },
    audience: {
      comments_analyzed: s.comments,
      interests: s.topics.map((topic, index) => ({ topic, mentions: Math.round(s.comments * (0.32 - index * 0.07)) })),
      frequent_questions: s.questions.map((question, index) => ({ theme: question, count: 24 - index * 6, examples: [question] })),
      insights: [], caveats: ['Synthetic comments for this sample business; not a measurement of your audience.'],
      representativeness: 'Illustrative sample only.',
    },
    trends: {
      as_of: asOf,
      current: s.trends.map((title, index) => ({
        trend: {
          trend_id: `mock-${industry}-trend-${index}`, title, category: industry.toUpperCase(), region: 'India',
          source_name: null, source_url: null, verified_date: null, expiry_date: null,
          direction: index === 0 ? 'RISING' : 'STABLE', confidence_score: 0.8 - index * 0.1, is_sample: true,
        },
        freshness: 'sample', profile_relevance: 0.94 - index * 0.12,
      })),
      notes: ['Illustrative trends, not verified market signals.'],
    },
    recommendations: s.ideas.map(([title, idea], index) => ({
      recommendation_id: `mock-${industry}-rec-${index}`, title, content_idea: idea,
      format: index % 2 === 0 ? s.format : 'CAROUSEL', objective: 'ENGAGEMENT', suggested_publish_date: null,
      opportunity_score: 88 - index * 7, confidence_score: 81 - index * 6,
      supporting_evidence: [{ signal: 'audience_interest', statement: `Sample comments mention ${s.topics[index % s.topics.length].toLowerCase()}.` }],
      risks_and_caveats: ['Sample recommendation only; results are not guaranteed.'], tags: [industry, 'sample'], created_at: asOf,
    })),
  }
}