import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { radioKeys } from '../../lib/radio'
import { REEL_LOOKS } from '../../lib/reels'
import { getAiUsage, type AiUsage, type ReelLook } from '../../services/reels'

/** How the photo is shown in the Reel. AI looks are offered only when the server has an AI image service. */
export function LookPicker({ value, onChange, disabled }: { value: ReelLook | null; onChange: (l: ReelLook) => void; disabled?: boolean }) {
  const t = useT()
  const [usage, setUsage] = useState<AiUsage | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    getAiUsage(ctrl.signal).then(setUsage).catch(() => setUsage(null))
    return () => ctrl.abort()
  }, [])

  const aiOn = Boolean(usage?.available)
  const left = usage?.today.remaining
  const looks = REEL_LOOKS.filter((l) => !l.ai || aiOn)
  // Nothing chosen yet means the app's own default: the enhanced photo when AI is available, else the free look.
  const current: ReelLook = value ?? (aiOn ? 'AI_ENHANCE' : 'FULL_PHOTO')

  return (
    <div className="looks">
      <div className="looks-grid" role="radiogroup" aria-label={t('reels.looks.aria')} onKeyDown={radioKeys}>
        {looks.map((l) => {
          const selected = current === l.id
          const outOfAllowance = l.ai && left === 0 && !selected
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled || outOfAllowance}
              className={`look-card ${selected ? 'is-selected' : ''}`}
              onClick={() => onChange(l.id)}
            >
              <span className="look-name">
                {t(`reels.looks.${l.id}.name`)}
                {l.ai ? <span className="look-ai">{t('reels.looks.ai')}</span> : null}
              </span>
              <small>{t(`reels.looks.${l.id}.hint`)}</small>
            </button>
          )
        })}
      </div>
      <p className="field-hint">
        {aiOn
          ? `${t('reels.looks.aiHint')} ${left == null ? '' : t(left === 1 ? 'reels.looks.leftOne' : 'reels.looks.leftMany', { n: left })}`
          : t('reels.looks.plain')}
      </p>
    </div>
  )
}
