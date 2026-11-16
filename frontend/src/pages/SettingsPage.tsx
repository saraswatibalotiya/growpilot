import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { InstagramGlyph } from '../components/Icon'
import { LanguagePicker } from '../components/LanguagePicker'
import { Banner, Button, Card, Field } from '../components/ui'
import { useT } from '../i18n'
import { errorMessage } from '../lib/api'
import type { Language } from '../lib/types'
import { updateProfile } from '../services/business'
import { startInstagramConnect } from '../services/instagram'
import { useAuth } from '../state/AuthContext'
import { CATEGORIES } from './SetupPage'

export function SettingsPage() {
  const t = useT()
  const navigate = useNavigate()
  const { business, user, instagram, reloadBusiness, reloadInstagram, signOut } = useAuth()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('clothing')
  const [city, setCity] = useState('')
  const [language, setLanguage] = useState<Language | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [igBusy, setIgBusy] = useState(false)
  const [igError, setIgError] = useState<string | null>(null)

  useEffect(() => {
    if (!business) return
    setName(business.name)
    setCategory(CATEGORIES.some((c) => c.value === business.category) ? business.category : CATEGORIES[0].value)
    setCity(business.city ?? '')
    setLanguage(business.preferredLanguage)
  }, [business])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateProfile({
        name: name.trim(),
        category,
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(language ? { preferredLanguage: language } : {}),
      })
      await reloadBusiness()
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    if (!business) return
    setIgBusy(true)
    setIgError(null)
    try {
      const { authorizationUrl } = await startInstagramConnect(business.id)
      window.location.assign(authorizationUrl)
    } catch (err) {
      setIgError(errorMessage(err))
      setIgBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.subtitle')}</p>
      </div>
      <div className="settings-grid">
        <Card>
          <h2 style={{ marginBottom: 16 }}>{t('settings.business')}</h2>
          <form onSubmit={save}>
            {error ? <div style={{ marginBottom: 14 }}><Banner tone="error">{error}</Banner></div> : null}
            {saved ? <div style={{ marginBottom: 14 }}><Banner tone="success">{t('settings.saved')}</Banner></div> : null}
            <Field label={t('settings.businessName')} htmlFor="s-name">
              <input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="two-col">
              <Field label={t('settings.category')} htmlFor="s-cat">
                <select id="s-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
                </select>
              </Field>
              <Field label={t('settings.location')} htmlFor="s-city">
                <input id="s-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
            <div className="field">
              <label>{t('settings.preferredLanguage')}</label>
              <LanguagePicker value={language} onChange={setLanguage} />
            </div>
            <Button type="submit" loading={busy} disabled={!name.trim() || !business}>{t('settings.saveChanges')}</Button>
          </form>
        </Card>

        <Card>
          <div className="row-between" style={{ marginBottom: 14 }}>
            <h2>Instagram</h2>
            <InstagramGlyph size={24} />
          </div>
          {instagram.state === 'connected' ? (
            <Banner tone="success">{t('settings.connectedAs')} <strong>@{instagram.account.username}</strong>.</Banner>
          ) : instagram.state === 'problem' ? (
            <Banner tone="warning">{t('settings.problemBefore')} <strong>@{instagram.account.username}</strong> {t('settings.problemAfter', { status: instagram.account.status })}</Banner>
          ) : instagram.state === 'none' ? (
            <Banner tone="info">{t('settings.noInstagram')}</Banner>
          ) : (
            <p className="muted">{t('settings.checking')}</p>
          )}
          {igError ? <div style={{ marginTop: 14 }}><Banner tone="error">{igError}</Banner></div> : null}
          <div className="actions">
            <Button variant="secondary" icon="external" loading={igBusy} onClick={() => void connect()} disabled={!business}>
              {instagram.state === 'connected' ? t('settings.reconnect') : t('settings.connect')}
            </Button>
            <Button variant="ghost" onClick={() => void reloadInstagram()}>{t('settings.refresh')}</Button>
          </div>
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: 12 }}>{t('settings.privacy')}</p>
        </Card>

        <Card>
          <h2 style={{ marginBottom: 6 }}>{t('settings.account')}</h2>
          <p className="muted" style={{ marginBottom: 14 }}>{user?.email}</p>
          <Button variant="secondary" icon="logout" onClick={async () => { await signOut(); navigate('/welcome') }}>
            {t('settings.signOut')}
          </Button>
        </Card>
      </div>
    </>
  )
}
