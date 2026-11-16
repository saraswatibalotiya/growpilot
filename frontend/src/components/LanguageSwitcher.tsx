import { UI_LANGUAGES, useI18n, type UiLanguage } from '../i18n'

const NATIVE: Record<UiLanguage, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' }

/** Switches the language of the whole app. The choice is remembered on this device. */
export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n()
  return (
    <select className="select lang-switch" value={language} aria-label={t('common.language')} onChange={(e) => setLanguage(e.target.value as UiLanguage)}>
      {UI_LANGUAGES.map((l) => (
        <option key={l} value={l} lang={l}>
          {NATIVE[l]}
        </option>
      ))}
    </select>
  )
}
