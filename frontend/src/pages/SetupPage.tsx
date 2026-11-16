import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LanguagePicker } from '../components/LanguagePicker'
import { Banner, Button, Field } from '../components/ui'
import { ApiError, errorMessage } from '../lib/api'
import { onboarding } from '../lib/onboarding'
import { useT } from '../i18n'
import type { Language } from '../lib/types'
import { updateProfile } from '../services/business'
import { useAuth } from '../state/AuthContext'

export const CATEGORIES = [
  { value: 'clothing', labelKey: 'setup.categories.clothing' },
  { value: 'jewellery', labelKey: 'setup.categories.jewellery' },
  { value: 'grocery', labelKey: 'setup.categories.grocery' },
  { value: 'footwear', labelKey: 'setup.categories.footwear' },
]

export function SetupPage() {
  const t = useT()
  const { status, signUp, reloadBusiness } = useAuth()
  const navigate = useNavigate()
  const account = onboarding.account()

  const [shop, setShop] = useState('')
  const [category, setCategory] = useState('clothing')
  const [city, setCity] = useState('')
  const [language, setLanguage] = useState<Language>(onboarding.language())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailTaken, setEmailTaken] = useState(false)

  if (status === 'signedIn') return <Navigate to="/" replace />
  // A refresh clears the in-memory account details, so start the account step again.
  if (!account) return <Navigate to="/signup" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setEmailTaken(false)
    try {
      await signUp({ name: account.name, email: account.email, password: account.password, business: { name: shop.trim(), category } })
      onboarding.clear()
      try {
        await updateProfile({
          ...(city.trim() ? { city: city.trim() } : {}),
          preferredLanguage: language,
          supportedLanguages: ['hi', 'mr', 'en'],
        })
        await reloadBusiness()
      } catch {
        // The account exists. Details can be completed from Settings, so don't block the user here.
      }
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setEmailTaken(true)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="public">
      <form className="auth-card" onSubmit={submit}>
        <div className="steps-dots" aria-label={t('setup.step')}>
          <span className="on" />
          <span className="on" />
        </div>
        <div className="auth-head">
          <div className="icon-bubble">
            <Icon name="store" size={26} />
          </div>
          <h1>{t('setup.title')}</h1>
          <p>{t('setup.subtitle')}</p>
        </div>
        {error ? (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="error">
              {error} {emailTaken ? <Link to="/login">{t('setup.signInInstead')}</Link> : null}
            </Banner>
          </div>
        ) : null}
        <Field label={t('setup.businessName')} htmlFor="shop">
          <input id="shop" className="input" required placeholder={t('setup.businessPlaceholder')} value={shop} onChange={(e) => setShop(e.target.value)} />
        </Field>
        <Field label={t('setup.category')} htmlFor="category">
          <select id="category" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('setup.location')} htmlFor="city" hint={t('setup.locationHint')}>
          <input id="city" className="input" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <div className="field">
          <label>{t('setup.preferredLanguage')}</label>
          <LanguagePicker value={language} onChange={setLanguage} />
        </div>
        <Button type="submit" size="lg" block iconEnd="arrow" loading={busy} disabled={!shop.trim()}>
          {t('setup.continue')}
        </Button>
        <p className="link-row" style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/signup">{t('setup.back')}</Link>
        </p>
      </form>
    </div>
  )
}
