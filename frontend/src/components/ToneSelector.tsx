import { useT } from '../i18n'
import { radioKeys } from '../lib/radio'
import { TONES, type Tone } from '../lib/tones'

/** The tone picker for a post or a reel. Nothing is selected until the owner chooses. */
export function ToneSelector({ value, onChange, disabled }: { value: Tone | null; onChange: (tone: Tone) => void; disabled?: boolean }) {
  const t = useT()
  const focusable = value ?? TONES[0]
  return (
    <div className="tone-picker">
      <div className="tone-grid" role="radiogroup" aria-label={t('tones.title')} onKeyDown={radioKeys}>
        {TONES.map((tone) => (
          <button key={tone} type="button" role="radio" aria-checked={value === tone} tabIndex={focusable === tone ? 0 : -1} className="tone-option" disabled={disabled} onClick={() => onChange(tone)}>
            <span>{t(`tones.names.${tone}`)}</span>
            {value === tone ? <span className="tone-check" aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
