import { useEffect, useRef } from 'react'
import { useSpeechRecognition } from '../../hooks/useSpeech'
import type { ReelLanguage } from '../../services/reels'
import { useT } from '../../i18n'
import { Banner, MicButton } from '../ui'

interface Props {
  id: string
  value: string
  onChange: (v: string) => void
  language: ReelLanguage
  rows?: number
  maxLength?: number
  placeholder?: string
  disabled?: boolean
  label: string
}

/** A textarea that can also be dictated, using the same speech hook as Create Post. */
export function DictationField({ id, value, onChange, language, rows = 3, maxLength, placeholder, disabled, label }: Props) {
  const t = useT()
  const speech = useSpeechRecognition(language)
  const base = useRef('')
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  })

  useEffect(() => {
    if (speech.listening || speech.text) change.current([base.current, speech.text].filter(Boolean).join(' ').slice(0, maxLength))
  }, [speech.text, speech.listening, maxLength])

  const toggle = () => {
    if (speech.listening) {
      speech.stop()
      return
    }
    base.current = value.trim()
    speech.start()
  }

  return (
    <div className="dictation">
      <textarea id={id} className="textarea" rows={rows} maxLength={maxLength} placeholder={placeholder} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label} lang={language} />
      {speech.supported ? <MicButton small recording={speech.listening} onClick={toggle} disabled={disabled} label={speech.listening ? t('reels.dictation.stop') : t('reels.dictation.start', { label: label.toLowerCase() })} /> : null}
      {speech.error ? <Banner tone="info">{speech.error}</Banner> : null}
    </div>
  )
}
