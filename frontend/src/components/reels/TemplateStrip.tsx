import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useT } from '../../i18n'
import { radioKeys } from '../../lib/radio'
import { TEMPLATES } from '../../lib/reels'
import type { ReelTemplate } from '../../services/reels'
import { TemplateOverlay } from './TemplateOverlay'

export function TemplateStrip({ value, onChange, imageUrl, disabled }: { value: ReelTemplate; onChange: (t: ReelTemplate) => void; imageUrl?: string | null; disabled?: boolean }) {
  const t = useT()
  const rail = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const el = rail.current
    if (!el) return
    const measure = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4)
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [])

  const next = () => {
    const el = rail.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className="tstrip">
      <div ref={rail} className="tstrip-rail" role="radiogroup" aria-label={t('reels.templates.aria')} onKeyDown={radioKeys}>
        {TEMPLATES.map((tpl) => {
          const selected = value === tpl.id
          return (
            <button
              key={tpl.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              className={`tcard ${selected ? 'is-selected' : ''}`}
              onClick={() => onChange(tpl.id)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
            >
              <span className="tcard-tile">
                {imageUrl ? (
                  <TemplateOverlay template={tpl.id} imageUrl={imageUrl} />
                ) : (
                  <span className="tcard-ph"><Icon name="reel" size={26} /></span>
                )}
                {selected ? <span className="tcard-check"><Icon name="check" size={14} strokeWidth={3} /></span> : null}
              </span>
              <span className="tcard-name">{t(`reels.templates.${tpl.id}.name`)}</span>
            </button>
          )
        })}
      </div>
      {more ? (
        <button type="button" className="tstrip-next" onClick={next} aria-label={t('reels.templates.more')}>
          <Icon name="arrow" size={18} />
        </button>
      ) : null}
    </div>
  )
}
