import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { STAGES, stageIndex } from '../../lib/reels'
import type { ReelStage } from '../../services/reels'

/** Steps before the current stage are done; the current one is animated. Nothing is complete until the reel is READY. */
export function StageList({ stage, ready }: { stage: ReelStage; ready?: boolean }) {
  const t = useT()
  const current = stageIndex(stage)
  return (
    <ol className="stage-list" aria-live="polite">
      {STAGES.map((s, i) => {
        const done = ready || i < current
        const active = !ready && i === current
        return (
          <li key={s.stage} className={`stage ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`} aria-current={active ? 'step' : undefined}>
            <span className="stage-dot" aria-hidden="true">{done ? <Icon name="check" size={16} /> : active ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : i + 1}</span>
            <span>{t(`reels.stages.${s.stage}`)}</span>
            <span className="sr-only">{done ? t('reels.stages.done') : active ? t('reels.stages.active') : t('reels.stages.waiting')}</span>
          </li>
        )
      })}
    </ol>
  )
}
