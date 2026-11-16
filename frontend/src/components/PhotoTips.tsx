import { useEffect, useState } from 'react'
import { Button } from './ui'
import { useT, translateIn } from '../i18n'
import { canSpeak, photoTips, photoTipsScript, speak, stopSpeaking, TIP_LANGUAGES, type TipLanguage } from '../lib/shotTips'

/** Always-visible shooting advice with a language switch and a read-aloud button. */
export function PhotoTips() {
  const t = useT()
  const [language, setLanguage] = useState<TipLanguage>('en')
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => stopSpeaking, [])

  const listen = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(speak(photoTipsScript(language), language, () => setSpeaking(false)))
  }

  return (
    <section className="photo-tips" aria-label={t('photo.tips.region')}>
      <div className="photo-tips-head">
        <h4>{translateIn(language, 'tips.title')}</h4>
        <div className="photo-tips-controls">
          <div className="photo-tips-lang" role="group" aria-label={t('photo.tips.language')}>
            {TIP_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                className={l.code === language ? 'on' : ''}
                aria-pressed={l.code === language}
                onClick={() => {
                  stopSpeaking()
                  setSpeaking(false)
                  setLanguage(l.code)
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
          {canSpeak() ? (
            <Button variant="secondary" size="sm" onClick={listen}>
              {speaking ? t('photo.tips.stop') : t('photo.tips.listen')}
            </Button>
          ) : null}
        </div>
      </div>
      <ul>
        {photoTips(language).map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </section>
  )
}
