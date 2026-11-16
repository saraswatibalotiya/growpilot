import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Banner, Button, Field } from '../components/ui'
import { errorMessage } from '../lib/api'
import { onboarding } from '../lib/onboarding'
import { useT } from '../i18n'
import { useAuth } from '../state/AuthContext'

export function LoginPage() {
  const t = useT()
  const { status, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'signedIn') return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="public">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-head">
          <div className="icon-bubble">
            <Icon name="user" size={26} />
          </div>
          <h1>{t('auth.login.title')}</h1>
          <p>{t('auth.login.subtitle')}</p>
        </div>
        {error ? (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
        <Field label={t('auth.email')} htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!email || !password}>
          {t('auth.login.submit')}
        </Button>
        <p className="link-row" style={{ textAlign: 'center', marginTop: 18 }}>
          {t('auth.login.newHere')} <Link to="/signup">{t('auth.login.createAccount')}</Link>
        </p>
      </form>
    </div>
  )
}

export function SignupPage() {
  const t = useT()
  const { status } = useAuth()
  const navigate = useNavigate()
  const existing = onboarding.account()
  const [name, setName] = useState(existing?.name ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)

  if (status === 'signedIn') return <Navigate to="/" replace />

  const passwordError = password.length > 0 && password.length < 12 ? t('auth.signup.tooShort') : password.length > 72 ? t('auth.signup.tooLong') : null
  const emailError = touched && !/^\S+@\S+\.\S+$/.test(email) ? t('auth.signup.badEmail') : null
  const valid = name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email) && password.length >= 12 && password.length <= 72

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    onboarding.setAccount({ name: name.trim(), email: email.trim().toLowerCase(), password })
    navigate('/setup')
  }

  return (
    <div className="public">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="steps-dots" aria-label={t('auth.signup.step')}>
          <span className="on" />
          <span />
        </div>
        <div className="auth-head">
          <div className="icon-bubble">
            <Icon name="user" size={26} />
          </div>
          <h1>{t('auth.signup.title')}</h1>
          <p>{t('auth.signup.subtitle')}</p>
        </div>
        <Field label={t('auth.signup.yourName')} htmlFor="name">
          <input id="name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('auth.email')} htmlFor="email" error={emailError}>
          <input id="email" className="input" type="email" autoComplete="email" required aria-invalid={Boolean(emailError)} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')} htmlFor="password" hint={t('auth.signup.passwordHint')} error={passwordError}>
          <input id="password" className="input" type="password" autoComplete="new-password" required aria-invalid={Boolean(passwordError)} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" block iconEnd="arrow" disabled={!valid}>
          {t('auth.signup.continue')}
        </Button>
        <p className="link-row" style={{ textAlign: 'center', marginTop: 18 }}>
          {t('auth.signup.haveAccount')} <Link to="/login">{t('auth.signup.signIn')}</Link>
        </p>
      </form>
    </div>
  )
}
