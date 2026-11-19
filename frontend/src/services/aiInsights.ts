import { request } from '../lib/api'

// Calls the GrowPilot backend (/ai-insights/*), which authenticates the owner and talks to the Python AI engine.
// The browser never contacts the engine, never sees its address or token, and never sends a business or profile id:
// the owner is always the signed-in user. Field names below mirror the engine's responses (snake_case).

export interface AiStatus {
  enabled: boolean
  available: boolean
}

/** What the backend says about the data the engine was given. */
export interface AiContext {
  instagramConnected: boolean
  /** True for a demo Instagram account: everything then rests on demo data. */
  mockAccount: boolean
  postsSent: number
}

export interface EngineInsight {
  key: string
  finding: string
  supporting_metrics: Record<string, number | string | null>
  confidence: number
  confidence_label: 'low' | 'medium' | 'high'
}

export interface PostScore {
  media_id: string
  permalink: string | null
  posted_at: string
  format: string
  topics: string[]
  engagement_rate: number | null
  performance_index: number | null
  index_basis: string | null
}

export interface AnalyticsReport {
  posts_analyzed: number
  baseline: { median_engagement_rate?: number | null; engagement_basis?: string | null; baseline_reliable?: number | boolean | null }
  insights: EngineInsight[]
  top_posts: PostScore[]
  warnings: string[]
}

export interface AnalysisResponse {
  analysis: AnalyticsReport
  context: AiContext
}

export interface AudienceInsights {
  comments_analyzed: number
  interests: { topic: string; mentions: number }[]
  frequent_questions: { theme: string; count: number; examples: string[] }[]
  insights: EngineInsight[]
  caveats: string[]
  representativeness: string
}

export interface Trend {
  trend_id: string
  title: string
  category: string
  region: string
  source_name: string | null
  source_url: string | null
  verified_date: string | null
  expiry_date: string | null
  direction: 'RISING' | 'STABLE' | 'FALLING' | 'UNKNOWN'
  confidence_score: number
  is_sample: boolean
}

export interface TrendAssessment {
  trend: Trend
  freshness: string
  profile_relevance: number
}

export interface TrendAnalysis {
  as_of: string
  current: TrendAssessment[]
  notes: string[]
}

export interface Evidence {
  signal: string
  statement: string
}

export interface Recommendation {
  recommendation_id: string
  title: string
  content_idea: string
  format: string
  objective: string
  suggested_publish_date: string | null
  opportunity_score: number
  confidence_score: number
  supporting_evidence: Evidence[]
  risks_and_caveats: string[]
  tags: string[]
  created_at: string
}

export interface RecommendationList {
  items: Recommendation[]
  total: number
}

export interface GeneratedRecommendations {
  recommendations: Recommendation[]
  notes: string[]
  context: AiContext
}

export type FeedbackAction = 'SAVED' | 'DISMISSED' | 'LIKED' | 'NOT_RELEVANT' | 'ALREADY_POSTED' | 'CREATED' | 'PUBLISHED'

let cachedStatus: { at: number; value: Promise<AiStatus> } | null = null

/** Whether AI insights are turned on and reachable. Never throws: any failure means "not available". Cached briefly. */
export function getAiStatus(force = false): Promise<AiStatus> {
  if (!force && cachedStatus && Date.now() - cachedStatus.at < 60_000) return cachedStatus.value
  const value = request<AiStatus>('/ai-insights/status').catch((): AiStatus => ({ enabled: false, available: false }))
  cachedStatus = { at: Date.now(), value }
  return value
}

export function clearAiStatusCache(): void {
  cachedStatus = null
}

export const runAnalysis = (signal?: AbortSignal) => request<AnalysisResponse>('/ai-insights/analysis', { method: 'POST', signal })
export const getAudience = (signal?: AbortSignal) => request<AudienceInsights>('/ai-insights/audience', { signal })
export const getTrends = (signal?: AbortSignal) => request<TrendAnalysis>('/ai-insights/trends', { signal })
export const listRecommendations = (signal?: AbortSignal) => request<RecommendationList>('/ai-insights/recommendations?page=1&pageSize=4', { signal })
export const generateRecommendations = (count = 4) =>
  request<GeneratedRecommendations>('/ai-insights/recommendations/generate', { method: 'POST', body: { count } })
export const sendFeedback = (id: string, action: FeedbackAction) =>
  request<unknown>(`/ai-insights/recommendations/${encodeURIComponent(id)}/feedback`, { method: 'POST', body: { action } })
