import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { translate, useT } from '../i18n'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'primary',
  size,
  block,
  loading,
  icon,
  iconEnd,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'lg'
  block?: boolean
  loading?: boolean
  icon?: IconName
  /** Icon shown after the label, used for forward actions such as Continue. */
  iconEnd?: IconName
}) {
  const classes = ['btn', `btn-${variant}`, size ? `btn-${size}` : '', block ? 'btn-block' : '', className].filter(Boolean).join(' ')
  return (
    <button {...rest} className={classes} disabled={rest.disabled || loading}>
      {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} aria-hidden /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {iconEnd && !loading ? <Icon name={iconEnd} size={18} /> : null}
    </button>
  )
}

export function Card({ children, pad = true, className = '' }: { children: ReactNode; pad?: boolean; className?: string }) {
  return <div className={`card ${pad ? 'card-pad' : ''} ${className}`}>{children}</div>
}

export function Banner({ tone, children }: { tone: 'error' | 'info' | 'warning' | 'success'; children: ReactNode }) {
  const icon: IconName = tone === 'error' || tone === 'warning' ? 'alert' : tone === 'success' ? 'check' : 'info'
  return (
    <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

const STATUS: Record<string, { label: string | null; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  DRAFT: { label: 'draft', tone: 'neutral' },
  CONTENT_GENERATED: { label: 'ready', tone: 'neutral' },
  PREVIEW_READY: { label: 'ready', tone: 'neutral' },
  USER_APPROVED: { label: 'approved', tone: 'warning' },
  PUBLISHING: { label: 'publishing', tone: 'warning' },
  PUBLISHED: { label: 'published', tone: 'success' },
  FAILED: { label: 'failed', tone: 'danger' },
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT()
  const s = STATUS[status] ?? { label: null, tone: 'neutral' as const }
  return <span className={`badge badge-${s.tone}`}>{s.label ? t(`ui.status.${s.label}`) : status}</span>
}

export function Spinner() {
  const t = useT()
  return <span className="spinner" role="status" aria-label={t('ui.loading')} />
}

export function Waveform({ live }: { live?: boolean }) {
  return (
    <div className={`waveform ${live ? 'is-live' : ''}`} aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  )
}

export function MicButton({
  recording,
  onClick,
  small,
  disabled,
  label,
}: {
  recording: boolean
  onClick: () => void
  small?: boolean
  disabled?: boolean
  label?: string
}) {
  const t = useT()
  return (
    <button
      type="button"
      className={`mic-btn ${recording ? 'is-recording' : ''} ${small ? 'is-small' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label ?? (recording ? t('ui.mic.stop') : t('ui.mic.start'))}
      aria-pressed={recording}
    >
      <Icon name={recording ? 'stop' : 'mic'} size={small ? 34 : 52} />
    </button>
  )
}

export function languageName(code: string | null | undefined): string {
  return code === 'hi' || code === 'mr' || code === 'en' ? translate(`ui.language.${code}`) : '—'
}
