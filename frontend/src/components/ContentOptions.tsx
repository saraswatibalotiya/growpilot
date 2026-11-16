import { useT } from '../i18n'
import { radioKeys } from '../lib/radio'
import { CAPTION_LENGTHS, HASHTAG_LEVELS, type CaptionLength, type HashtagLevel } from '../lib/tones'

interface Props {
  captionLength: CaptionLength
  hashtagLevel: HashtagLevel
  onCaptionLength: (value: CaptionLength) => void
  onHashtagLevel: (value: HashtagLevel) => void
  disabled?: boolean
}

function Choice<T extends string>({ label, name, values, value, onChange, disabled }: { label: string; name: string; values: readonly T[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  const t = useT()
  return (
    <div className="option-row">
      <span className="option-label" id={`opt-${name}`}>{label}</span>
      <div className="option-seg" role="radiogroup" aria-labelledby={`opt-${name}`} onKeyDown={radioKeys}>
        {values.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} tabIndex={value === v ? 0 : -1} className="option-btn" disabled={disabled} onClick={() => onChange(v)}>
            {t(`options.${name}.${v}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Caption length and number of hashtags, for a post or a reel. */
export function ContentOptions({ captionLength, hashtagLevel, onCaptionLength, onHashtagLevel, disabled }: Props) {
  const t = useT()
  return (
    <div className="content-options">
      <Choice label={t('options.captionLength.title')} name="captionLength" values={CAPTION_LENGTHS} value={captionLength} onChange={onCaptionLength} disabled={disabled} />
      <Choice label={t('options.hashtags.title')} name="hashtags" values={HASHTAG_LEVELS} value={hashtagLevel} onChange={onHashtagLevel} disabled={disabled} />
    </div>
  )
}
