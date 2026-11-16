import { useT } from '../i18n'
import type { Language } from '../lib/types'

const OPTIONS: { code: Language; label: string }[] = [
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
  { code: 'en', label: 'English' },
]

export function LanguagePicker({ value, onChange, disabled }: { value: Language | null; onChange: (language: Language) => void; disabled?: boolean }) {
  const t = useT()
  return (
    <div className="chips" role="group" aria-label={t('photo.language.label')}>
      {OPTIONS.map((o) => (
        <button key={o.code} type="button" className="chip" aria-pressed={value === o.code} disabled={disabled} onClick={() => onChange(o.code)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
