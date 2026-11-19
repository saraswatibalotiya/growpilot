import type { AnalyticsReport, EngineInsight, Trend } from '../services/aiInsights'

// Pure helpers behind the AI Overview screen. No React, no network: they can be tested on their own (see frontend/tests).

export type Tone = 'good' | 'watch' | 'steady' | 'unknown'

export interface HealthIndicator {
  key: 'trend' | 'recent' | 'rhythm' | 'data'
  tone: Tone
  /** Numbers for the translated label; the screen fills them into aiInsights.health.<key>.<tone>. */
  vars: Record<string, string | number>
  /** The engine's own sentence behind it (English), shown as evidence. */
  evidence: string | null
}

const find = (report: AnalyticsReport, key: string): EngineInsight | undefined => report.insights.find((i) => i.key === key)
const num = (v: number | string | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A change of this size or more counts as up/down. Smaller is "steady". */
export const TREND_BAND = 0.05
/** A recent average index this far from 1.0 counts as better/worse than typical. */
export const RECENT_BAND = 0.05
/** A gap this long between posts is worth flagging. */
export const LONG_GAP_DAYS = 14

/**
 * Account health as plain indicators, each with the evidence behind it. There is deliberately NO single health score: the engine does
 * not produce one, and a number made up here would look more certain than the data is. An indicator the engine could not compute is
 * simply left out; nothing is shown as zero.
 */
export function accountHealth(report: AnalyticsReport): HealthIndicator[] {
  const out: HealthIndicator[] = []

  const trend = find(report, 'engagement_trend')
  const change = num(trend?.supporting_metrics.change)
  if (trend && change !== null) {
    out.push({ key: 'trend', tone: change >= TREND_BAND ? 'good' : change <= -TREND_BAND ? 'watch' : 'steady', vars: { percent: Math.abs(Math.round(change * 100)) }, evidence: trend.finding })
  }

  const recent = find(report, 'recent_performance')
  const index = num(recent?.supporting_metrics.recent_mean_index)
  if (recent && index !== null) {
    out.push({ key: 'recent', tone: index >= 1 + RECENT_BAND ? 'good' : index <= 1 - RECENT_BAND ? 'watch' : 'steady', vars: { index: index.toFixed(2), posts: num(recent.supporting_metrics.posts) ?? 0 }, evidence: recent.finding })
  }

  const rhythm = find(report, 'consistency')
  const perWeek = num(rhythm?.supporting_metrics.posts_per_week)
  const gap = num(rhythm?.supporting_metrics.longest_gap_days)
  if (rhythm && perWeek !== null) {
    out.push({ key: 'rhythm', tone: gap !== null && gap >= LONG_GAP_DAYS ? 'watch' : 'steady', vars: { perWeek: perWeek.toFixed(1), gap: gap ?? 0 }, evidence: rhythm.finding })
  }

  const reliable = Boolean(report.baseline.baseline_reliable)
  out.push({ key: 'data', tone: reliable ? 'steady' : 'watch', vars: { posts: report.posts_analyzed }, evidence: report.warnings[0] ?? null })
  return out
}

export interface BestFormat {
  format: string
  rate: number | null
}

export function bestFormat(report: AnalyticsReport): BestFormat | null {
  const insight = find(report, 'best_format')
  const format = insight?.supporting_metrics.best_format
  return typeof format === 'string' ? { format, rate: num(insight?.supporting_metrics.best_median_rate) } : null
}

/** "5.2%" from 0.052. Null stays null: an unknown rate is never shown as 0%. */
export function percent(rate: number | null | undefined, digits = 1): string | null {
  return typeof rate === 'number' && Number.isFinite(rate) ? `${(rate * 100).toFixed(digits)}%` : null
}

/** How a recommendation score should be drawn: clamped to 0-100 so a bad value can not break the layout. */
export function meterWidth(score: number): number {
  return Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0
}

/** Trends the owner should see, freshest and most relevant first. Only trends the engine marked current are passed in. */
export function sortTrends<T extends { trend: Trend; profile_relevance: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.profile_relevance - a.profile_relevance || (b.trend.verified_date ?? '').localeCompare(a.trend.verified_date ?? ''))
}

export type SectionKind = 'ready' | 'empty' | 'unavailable' | 'error'

/** Maps an HTTP status from /ai-insights/* to what the section should show. */
export function sectionKindFor(status: number): Exclude<SectionKind, 'ready'> {
  if (status === 409 || status === 404) return 'empty' // not enough data yet, or no business yet: not a fault
  if (status === 503 || status === 0) return 'unavailable'
  return 'error'
}
