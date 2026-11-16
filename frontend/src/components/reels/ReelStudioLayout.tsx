import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

const STEPS = ['photo', 'generate', 'preview', 'edit', 'publish'] as const
export type StudioStep = 1 | 2 | 3 | 4 | 5

/** Informational progress. Only steps that are safe to revisit are links. */
export function ReelStepper({ step, reelId }: { step: StudioStep; reelId?: string }) {
  const t = useT()
  const href = (n: number): string | null => {
    if (n >= step) return null
    if (n === 1) return '/reels'
    if (n === 3 && reelId) return `/reels/${reelId}`
    return null
  }
  return (
    <nav aria-label={t('reels.layout.progress')} className="rs">
      <ol>
        {STEPS.map((stepId, i) => {
          const n = i + 1
          const done = n < step
          const to = href(n)
          const inner = (
            <>
              <span className="rs-dot" aria-hidden="true">{done ? <Icon name="check" size={13} strokeWidth={3} /> : n}</span>
              <span className="rs-label">{t(`reels.layout.steps.${stepId}`)}</span>
              {done ? <span className="sr-only"> {t('reels.layout.done')}</span> : null}
            </>
          )
          return (
            <li key={stepId} className={`rs-item ${done ? 'is-done' : ''} ${n === step ? 'is-current' : ''}`} aria-current={n === step ? 'step' : undefined}>
              {to ? <Link to={to} className="rs-in">{inner}</Link> : <span className="rs-in">{inner}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function StepCard({ n, title, done, aside, children }: { n: number; title: string; done?: boolean; aside?: ReactNode; children: ReactNode }) {
  const id = `step-${n}-title`
  return (
    <section className="step-card" aria-labelledby={id}>
      <header className="step-head">
        <span className={`step-badge ${done ? 'is-done' : ''}`} aria-hidden="true">{done ? <Icon name="check" size={16} strokeWidth={3} /> : n}</span>
        <h2 id={id}>{title}</h2>
        {aside}
      </header>
      <div className="step-body">{children}</div>
    </section>
  )
}

/** One shared studio: step cards or details on the left, the persistent Reel Preview on the right. */
export function ReelStudioLayout({ step, reelId, title, subtitle, left, preview }: { step: StudioStep; reelId?: string; title: string; subtitle?: string; left: ReactNode; preview: ReactNode }) {
  const t = useT()
  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <Link to="/reels/library" className="studio-lib"><Icon name="reel" size={16} /> {t('reels.layout.myReels')}</Link>
      </header>
      <ReelStepper step={step} reelId={reelId} />
      <div className="studio-grid">
        <div className="studio-main">{left}</div>
        <aside className="studio-side" aria-label={t('reels.layout.previewAria')}>{preview}</aside>
      </div>
    </div>
  )
}
