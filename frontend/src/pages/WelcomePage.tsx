import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Icon'
import { ShopIllustration } from '../components/Illustrations'
import { LanguagePicker } from '../components/LanguagePicker'
import { Button } from '../components/ui'
import { onboarding } from '../lib/onboarding'
import { useT } from '../i18n'
import type { Language } from '../lib/types'
import { useAuth } from '../state/AuthContext'

export function WelcomePage() {
  const t = useT()
  const { status } = useAuth()
  const navigate = useNavigate()
  const [language, setLanguage] = useState<Language>(onboarding.language())

  if (status === 'signedIn') return <Navigate to="/" replace />

  return (
    <div className="public">
      <div className="welcome-card">
        <div className="welcome-art">
          <ShopIllustration />
        </div>
        <div className="welcome-body">
          <div className="brand-big">
            <Logo size={44} />
            GrowPilot
          </div>
          <p className="tagline">{t('welcome.tagline')}</p>
          <p className="lede">{t('welcome.lede')}</p>
          <div className="pick-label">{t('welcome.chooseLanguage')}</div>
          <LanguagePicker
            value={language}
            onChange={(l) => {
              setLanguage(l)
              onboarding.setLanguage(l)
            }}
          />
          <div>
            <Button size="lg" iconEnd="arrow" onClick={() => navigate('/signup')}>
              {t('welcome.getStarted')}
            </Button>
          </div>
          <p className="link-row">
            {t('welcome.haveAccount')} <Link to="/login">{t('welcome.signIn')}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
