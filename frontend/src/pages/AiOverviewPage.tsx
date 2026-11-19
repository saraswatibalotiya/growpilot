import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AudienceBlock, BestContent, HealthIndicators, RecommendationRow, SectionCard, TrendsBlock } from '../components/AiInsightCards'
import { Banner, Button, EmptyState, Field, Spinner } from '../components/ui'
import { useT } from '../i18n'
import { accountHealth } from '../lib/aiOverview'
import { useAiOverview, useAiStatus, useMockAiOverview, type AiOverview } from '../hooks/useAiOverview'
import { AI_MOCK_INDUSTRIES, type AiMockIndustry } from '../mocks/aiInsights'

/** AI Overview: account health, best content, audience, trends and the latest ideas, from the AI engine via the GrowPilot backend. */
export function AiOverviewPage() {
  const t = useT()
  const status = useAiStatus()
  const [source, setSource] = useState('live')
  const [industry, setIndustry] = useState<AiMockIndustry>('fashion')
  let content: ReactNode
  if (source === 'mock') {
    content = <MockOverview key={industry} industry={industry} />
  } else if (status === null) {
    content = <div className="ai-loading"><Spinner /></div>
  } else if (!status.enabled) {
    content = (
      <EmptyState icon="sparkle" title={t('aiInsights.off.title')} action={<Link to="/" className="btn btn-secondary">{t('aiInsights.off.home')}</Link>}>
        {t('aiInsights.off.body')}
      </EmptyState>
    )
  } else if (!status.available) {
    content = <Banner tone="warning">{t('aiInsights.unavailable')}</Banner>
  } else {
    content = <LiveOverview />
  }

  return (
    <>
      <PageHead />
      <div className="ai-data-controls">
        <Field label={t('aiInsights.preview.source')} htmlFor="ai-data-source">
          <select id="ai-data-source" className="select" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="live">{t('aiInsights.preview.live')}</option>
            <option value="mock">{t('aiInsights.preview.mock')}</option>
          </select>
        </Field>
        <Field label={t('aiInsights.preview.industry')} htmlFor="ai-mock-industry">
          <select id="ai-mock-industry" className="select" disabled={source !== 'mock'} value={industry} onChange={(event) => setIndustry(event.target.value as AiMockIndustry)}>
            {AI_MOCK_INDUSTRIES.map((value) => <option key={value} value={value}>{t(`aiInsights.preview.${value}`)}</option>)}
          </select>
        </Field>
      </div>
      {content}
    </>
  )
}

function LiveOverview() {
  const overview = useAiOverview(true)
  return <OverviewContent o={overview} />
}

function MockOverview({ industry }: Readonly<{ industry: AiMockIndustry }>) {
  const overview = useMockAiOverview(industry)
  return <OverviewContent o={overview} mockIndustry={industry} />
}

function OverviewContent({ o, mockIndustry }: Readonly<{ o: AiOverview; mockIndustry?: AiMockIndustry }>) {
  const t = useT()
  const generateLabel = o.recommendations.kind === 'ready' && o.recommendations.data.length > 0 ? 'aiInsights.recs.regenerate' : 'aiInsights.recs.generate'
  return (
    <>
      <div className="ai-overview-actions">
        <Button variant="secondary" size="sm" onClick={o.reload}>{t('aiInsights.refresh')}</Button>
      </div>
      {mockIndustry ? <Banner tone="info">{t('aiInsights.preview.notice', { industry: t(`aiInsights.preview.${mockIndustry}`) })}</Banner> : null}
      {o.context?.mockAccount ? <Banner tone="info">{t('aiInsights.demoData')}</Banner> : null}
      {o.context && !o.context.instagramConnected ? <Banner tone="info">{t('aiInsights.connect')}</Banner> : null}

      <div className="ai-grid">
        <SectionCard title={t('aiInsights.health.title')} hint={t('aiInsights.health.hint')} section={o.analysis} onRetry={o.reload}>
          {(report) => (
            <>
              <HealthIndicators items={accountHealth(report)} />
              <p className="ai-fine">{t('aiInsights.health.note')}</p>
            </>
          )}
        </SectionCard>

        <SectionCard title={t('aiInsights.best.title')} hint={t('aiInsights.best.hint')} section={o.analysis} onRetry={o.reload}>
          {(report) => <BestContent report={report} />}
        </SectionCard>

        <SectionCard title={t('aiInsights.audience.title')} hint={t('aiInsights.audience.hint')} section={o.audience} onRetry={o.reload}>
          {(audience) => <AudienceBlock audience={audience} />}
        </SectionCard>

        <SectionCard title={t('aiInsights.trends.title')} hint={t('aiInsights.trends.hint')} section={o.trends} onRetry={o.reload}>
          {(trends) => <TrendsBlock analysis={trends} />}
        </SectionCard>
      </div>

      <SectionCard title={t('aiInsights.recs.title')} hint={t('aiInsights.recs.hint')} section={o.recommendations} onRetry={o.reload}>
        {(recs) => (
          <>
            {recs.length === 0 ? <p className="ai-muted">{t('aiInsights.recs.none')}</p> : null}
            <ul className="ai-recs">
              {recs.map((r) => (
                <RecommendationRow key={r.recommendation_id} rec={r} acted={o.acted[r.recommendation_id]} onFeedback={(a) => void o.feedback(r.recommendation_id, a)} />
              ))}
            </ul>
            {o.generateError ? <Banner tone="error">{o.generateError}</Banner> : null}
            <div className="ai-generate">
              <Button icon="sparkle" loading={o.generating} onClick={() => void o.generate()}>
                {t(mockIndustry ? 'aiInsights.preview.reset' : generateLabel)}
              </Button>
              <small>{t('aiInsights.recs.disclaimer')}</small>
            </div>
          </>
        )}
      </SectionCard>
    </>
  )
}

function PageHead() {
  const t = useT()
  return (
    <div className="page-head row-between">
      <div>
        <h1>{t('aiInsights.title')}</h1>
        <p>{t('aiInsights.subtitle')}</p>
      </div>
    </div>
  )
}
