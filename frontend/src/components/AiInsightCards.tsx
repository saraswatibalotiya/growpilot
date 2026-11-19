import type { ReactNode } from 'react'
import { useT } from '../i18n'
import { bestFormat, meterWidth, percent, sortTrends, type HealthIndicator } from '../lib/aiOverview'
import type { AnalyticsReport, AudienceInsights, FeedbackAction, PostScore, Recommendation, TrendAnalysis } from '../services/aiInsights'
import { Button, Card, EmptyState, Spinner } from './ui'
import { Icon } from './Icon'
import type { Section } from '../hooks/useAiOverview'

/** One block of the overview. Shows a spinner, a plain message, or its content: never a blank card. */
export function SectionCard<T>({ title, hint, section, children, emptyIcon = 'info', onRetry }: {
  title: string
  hint?: string
  section: Section<T>
  children: (data: T) => ReactNode
  emptyIcon?: 'info' | 'alert'
  onRetry?: () => void
}) {
  const t = useT()
  return (
    <Card className="ai-card">
      <header className="ai-card-head">
        <h2>{title}</h2>
        {hint ? <p className="ai-hint">{hint}</p> : null}
      </header>
      {section.kind === 'loading' ? (
        <div className="ai-loading">
          <Spinner />
        </div>
      ) : section.kind === 'ready' ? (
        children(section.data)
      ) : (
        <EmptyState
          icon={section.kind === 'empty' ? emptyIcon : 'alert'}
          title={t(`aiInsights.state.${section.kind}`)}
          action={section.kind !== 'empty' && onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>{t('aiInsights.retry')}</Button> : undefined}
        >
          {section.message}
        </EmptyState>
      )}
    </Card>
  )
}

export function HealthIndicators({ items }: { items: HealthIndicator[] }) {
  const t = useT()
  return (
    <ul className="ai-health">
      {items.map((i) => (
        <li key={i.key} className={`ai-health-item tone-${i.tone}`}>
          <span className="ai-dot" aria-hidden />
          <div>
            <strong>{t(`aiInsights.health.${i.key}.${i.tone}`, i.vars)}</strong>
            {i.evidence ? <small>{i.evidence}</small> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function PostRow({ post }: { post: PostScore }) {
  const t = useT()
  const rate = percent(post.engagement_rate)
  const date = new Date(post.posted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return (
    <li className="ai-post">
      <div className="ai-post-main">
        <strong>{t(`aiInsights.formats.${post.format}`)}</strong>
        {post.topics.length ? <span className="ai-chips">{post.topics.slice(0, 3).map((x) => <span key={x} className="ai-chip">{x}</span>)}</span> : null}
        <small>{date}</small>
      </div>
      <div className="ai-post-stats">
        {post.performance_index !== null ? <span className="ai-stat">{t('aiInsights.best.index', { index: post.performance_index.toFixed(1) })}</span> : null}
        {rate ? <span className="ai-stat muted">{t('aiInsights.best.rate', { rate })}</span> : null}
        {post.permalink ? (
          <a href={post.permalink} target="_blank" rel="noreferrer" aria-label={t('aiInsights.best.open')}>
            <Icon name="external" size={16} />
          </a>
        ) : null}
      </div>
    </li>
  )
}

export function BestContent({ report }: { report: AnalyticsReport }) {
  const t = useT()
  const best = bestFormat(report)
  const rate = percent(best?.rate)
  if (report.top_posts.length === 0) return <p className="ai-muted">{t('aiInsights.best.none')}</p>
  return (
    <>
      {best ? <p className="ai-lead">{rate ? t('aiInsights.best.format', { format: t(`aiInsights.formats.${best.format}`), rate }) : t('aiInsights.best.formatNoRate', { format: t(`aiInsights.formats.${best.format}`) })}</p> : null}
      <ul className="ai-posts">{report.top_posts.slice(0, 3).map((p) => <PostRow key={p.media_id} post={p} />)}</ul>
      <p className="ai-fine">{t('aiInsights.best.note')}</p>
    </>
  )
}

export function AudienceBlock({ audience }: { audience: AudienceInsights }) {
  const t = useT()
  return (
    <>
      <p className="ai-lead">{t('aiInsights.audience.analysed', { count: audience.comments_analyzed })}</p>
      {audience.frequent_questions.length ? (
        <>
          <h3>{t('aiInsights.audience.questions')}</h3>
          <ul className="ai-list">
            {audience.frequent_questions.slice(0, 3).map((q) => (
              <li key={q.theme}>
                <strong>{q.theme}</strong> <span className="ai-count">×{q.count}</span>
                {q.examples[0] ? <small>“{q.examples[0]}”</small> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {audience.interests.length ? (
        <>
          <h3>{t('aiInsights.audience.interests')}</h3>
          <span className="ai-chips">{audience.interests.slice(0, 6).map((i) => <span key={i.topic} className="ai-chip">{i.topic} · {i.mentions}</span>)}</span>
        </>
      ) : null}
      <p className="ai-fine">{audience.caveats[0] ?? audience.representativeness}</p>
    </>
  )
}

export function TrendsBlock({ analysis }: { analysis: TrendAnalysis }) {
  const t = useT()
  const items = sortTrends(analysis.current).slice(0, 4)
  if (items.length === 0) return <p className="ai-muted">{analysis.notes[0] ?? t('aiInsights.trends.none')}</p>
  return (
    <>
      <ul className="ai-list">
        {items.map(({ trend, profile_relevance: relevance }) => (
          <li key={trend.trend_id}>
            <strong>{trend.title}</strong>
            {trend.is_sample ? <span className="ai-badge sample">{t('aiInsights.trends.sample')}</span> : null}
            {trend.direction !== 'UNKNOWN' ? <span className="ai-badge">{t(`aiInsights.trends.direction.${trend.direction}`)}</span> : null}
            <small>
              {trend.source_name ? t('aiInsights.trends.source', { source: trend.source_name, date: trend.verified_date ?? '—' }) : t('aiInsights.trends.noSource')} · {t('aiInsights.trends.relevance', { percent: Math.round(relevance * 100) })}
            </small>
          </li>
        ))}
      </ul>
      {items.some((i) => i.trend.is_sample) ? <p className="ai-fine">{t('aiInsights.trends.sampleNote')}</p> : null}
    </>
  )
}

function Meter({ label, value, tone }: { label: string; value: number; tone: 'opportunity' | 'confidence' }) {
  return (
    <div className="ai-meter">
      <span>{label}</span>
      <div className={`ai-meter-bar ${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meterWidth(value)} aria-label={label}>
        <i style={{ width: `${meterWidth(value)}%` }} />
      </div>
      <b>{meterWidth(value)}</b>
    </div>
  )
}

export function RecommendationRow({ rec, acted, onFeedback }: { rec: Recommendation; acted?: FeedbackAction; onFeedback: (action: FeedbackAction) => void }) {
  const t = useT()
  const evidence = rec.supporting_evidence.find((e) => e.signal !== 'goal') ?? rec.supporting_evidence[0]
  return (
    <li className={`ai-rec ${acted ? 'is-acted' : ''}`}>
      <div className="ai-rec-head">
        <strong>{rec.title}</strong>
        <span className="ai-chip">{t(`aiInsights.formats.${rec.format}`)}</span>
      </div>
      <p>{rec.content_idea}</p>
      <div className="ai-meters">
        <Meter label={t('aiInsights.recs.opportunity')} value={rec.opportunity_score} tone="opportunity" />
        <Meter label={t('aiInsights.recs.confidence')} value={rec.confidence_score} tone="confidence" />
      </div>
      <small className="ai-evidence">{evidence ? t('aiInsights.recs.because', { evidence: evidence.statement }) : t('aiInsights.recs.noEvidence')}</small>
      {rec.risks_and_caveats[0] ? <small className="ai-caveat">{rec.risks_and_caveats[0]}</small> : null}
      <div className="ai-rec-actions">
        {acted ? (
          <span className="ai-acted">{t(acted === 'SAVED' ? 'aiInsights.recs.saved' : 'aiInsights.recs.hidden')}</span>
        ) : (
          <>
            <Button variant="secondary" size="sm" icon="star" onClick={() => onFeedback('SAVED')}>{t('aiInsights.recs.save')}</Button>
            <Button variant="ghost" size="sm" onClick={() => onFeedback('NOT_RELEVANT')}>{t('aiInsights.recs.notRelevant')}</Button>
          </>
        )}
      </div>
    </li>
  )
}
