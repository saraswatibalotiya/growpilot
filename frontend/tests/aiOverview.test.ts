// Run with: npm run test:unit  (Node's built-in test runner; no extra dependencies)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountHealth, bestFormat, meterWidth, percent, sectionKindFor, sortTrends } from '../src/lib/aiOverview.ts'
import type { AnalyticsReport, EngineInsight } from '../src/services/aiInsights.ts'
import { AI_MOCK_INDUSTRIES, createAiMockDataset } from '../src/mocks/aiInsights.ts'

test('all four mock businesses provide complete, distinct overview data', () => {
  const now = new Date('2026-11-19T12:00:00Z')
  const titles = new Set<string>()
  for (const industry of AI_MOCK_INDUSTRIES) {
    const data = createAiMockDataset(industry, now)
    assert.equal(accountHealth(data.analysis).length, 4)
    assert.ok(bestFormat(data.analysis))
    assert.equal(data.analysis.top_posts.length, 3)
    assert.ok(data.analysis.top_posts.every((post) => post.permalink === null && post.posted_at < now.toISOString()))
    assert.equal(data.audience.frequent_questions.length, 3)
    assert.ok(data.trends.current.every(({ trend }) => trend.is_sample && trend.source_url === null && trend.verified_date === null))
    assert.equal(data.recommendations.length, 4)
    for (const rec of data.recommendations) titles.add(rec.title)
  }
  assert.equal(titles.size, 16)
  assert.equal(accountHealth(createAiMockDataset('grooming', now).analysis).find((item) => item.key === 'trend')?.tone, 'watch')
  assert.equal(accountHealth(createAiMockDataset('fashion', now).analysis).find((item) => item.key === 'trend')?.tone, 'good')
})

test('mock datasets are fresh copies and dates follow the preview date', () => {
  const now = new Date('2026-11-19T12:00:00Z')
  const first = createAiMockDataset('beauty', now)
  first.recommendations.pop()
  const second = createAiMockDataset('beauty', now)
  assert.equal(second.recommendations.length, 4)
  assert.equal(second.trends.as_of, now.toISOString())
  assert.equal(second.analysis.top_posts[0].posted_at, '2026-11-18T12:00:00.000Z')
})

const insight = (key: string, metrics: Record<string, number | string | null>, finding = `finding for ${key}`): EngineInsight => ({ key, finding, supporting_metrics: metrics, confidence: 0.7, confidence_label: 'high' })
const report = (insights: EngineInsight[], over: Partial<AnalyticsReport> = {}): AnalyticsReport => ({ posts_analyzed: 27, baseline: { baseline_reliable: 1 }, insights, top_posts: [], warnings: [], ...over })

test('engagement trend: up, down and steady use a 5% band', () => {
  const tone = (change: number) => accountHealth(report([insight('engagement_trend', { change })])).find((i) => i.key === 'trend')?.tone
  assert.equal(tone(0.14), 'good')
  assert.equal(tone(-0.14), 'watch')
  assert.equal(tone(0.04), 'steady')
  assert.equal(tone(-0.04), 'steady')
  assert.equal(tone(0.05), 'good')
})

test('the trend indicator shows the size of the change without a sign', () => {
  const i = accountHealth(report([insight('engagement_trend', { change: -0.137 })])).find((x) => x.key === 'trend')
  assert.deepEqual(i?.vars, { percent: 14 })
})

test('recent performance compares the last posts with 1.0 (typical)', () => {
  const tone = (v: number) => accountHealth(report([insight('recent_performance', { recent_mean_index: v, posts: 5 })])).find((i) => i.key === 'recent')?.tone
  assert.equal(tone(1.3), 'good')
  assert.equal(tone(0.8), 'watch')
  assert.equal(tone(1.0), 'steady')
})

test('a long gap between posts is flagged; a normal rhythm is not', () => {
  const tone = (gap: number) => accountHealth(report([insight('consistency', { posts_per_week: 3.3, longest_gap_days: gap })])).find((i) => i.key === 'rhythm')?.tone
  assert.equal(tone(14), 'watch')
  assert.equal(tone(3), 'steady')
})

test('an indicator the engine could not compute is left out, never shown as zero', () => {
  const keys = accountHealth(report([insight('engagement_trend', { change: null }), insight('recent_performance', {}), insight('consistency', { posts_per_week: null })])).map((i) => i.key)
  assert.deepEqual(keys, ['data'])
  assert.deepEqual(accountHealth(report([])).map((i) => i.key), ['data'])
})

test('there is no single health score: every indicator is a labelled sign with evidence', () => {
  const items = accountHealth(report([insight('engagement_trend', { change: 0.2 }), insight('recent_performance', { recent_mean_index: 1.2, posts: 5 }), insight('consistency', { posts_per_week: 3, longest_gap_days: 2 })]))
  assert.deepEqual(items.map((i) => i.key), ['trend', 'recent', 'rhythm', 'data'])
  assert.ok(items.slice(0, 3).every((i) => i.evidence))
  assert.ok(items.every((i) => !('score' in i)))
})

test('thin data is flagged as tentative', () => {
  const thin = accountHealth(report([], { posts_analyzed: 3, baseline: { baseline_reliable: 0 }, warnings: ['Only 3 posts have an engagement rate'] })).find((i) => i.key === 'data')
  assert.equal(thin?.tone, 'watch')
  assert.deepEqual(thin?.vars, { posts: 3 })
  assert.equal(thin?.evidence, 'Only 3 posts have an engagement rate')
  assert.equal(accountHealth(report([])).find((i) => i.key === 'data')?.tone, 'steady')
})

test('best format reads the engine insight', () => {
  assert.deepEqual(bestFormat(report([insight('best_format', { best_format: 'REEL', best_median_rate: 0.052 })])), { format: 'REEL', rate: 0.052 })
  assert.equal(bestFormat(report([])), null)
  assert.deepEqual(bestFormat(report([insight('best_format', { best_format: 'CAROUSEL' })])), { format: 'CAROUSEL', rate: null })
})

test('percent never turns an unknown rate into 0%', () => {
  assert.equal(percent(0.052), '5.2%')
  assert.equal(percent(0), '0.0%') // a real zero is a real zero
  assert.equal(percent(null), null)
  assert.equal(percent(undefined), null)
  assert.equal(percent(Number.NaN), null)
})

test('meters are clamped so a bad score can not break the layout', () => {
  assert.equal(meterWidth(64.4), 64)
  assert.equal(meterWidth(250), 100)
  assert.equal(meterWidth(-5), 0)
  assert.equal(meterWidth(Number.NaN), 0)
})

test('trends are ordered by relevance, then by how recently they were checked', () => {
  const t = (id: string, relevance: number, verified: string | null) => ({ profile_relevance: relevance, trend: { trend_id: id, title: id, category: 'FOOD', region: 'India', source_name: 's', source_url: null, verified_date: verified, expiry_date: null, direction: 'UNKNOWN' as const, confidence_score: 0.5, is_sample: false } })
  assert.deepEqual(sortTrends([t('a', 0.5, '2026-11-01'), t('b', 0.9, '2026-10-01'), t('c', 0.5, '2026-11-10')]).map((x) => x.trend.trend_id), ['b', 'c', 'a'])
})

test('HTTP statuses map to calm states, not errors, when the cause is just missing data', () => {
  assert.equal(sectionKindFor(409), 'empty') // not enough posts or comments yet
  assert.equal(sectionKindFor(404), 'empty') // no business profile yet
  assert.equal(sectionKindFor(503), 'unavailable') // engine off or down
  assert.equal(sectionKindFor(0), 'unavailable') // network
  assert.equal(sectionKindFor(500), 'error')
  assert.equal(sectionKindFor(502), 'error')
})
