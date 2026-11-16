import { Navigate, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Button, Card } from '../components/ui'
import { useT } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { usePostFlow } from '../state/PostFlowContext'

const COLORS = ['#7448e6', '#ee4f99', '#ffb25a', '#37b79a', '#4aa3ff']

/** Only reachable with a post the backend reported as PUBLISHED. */
export function DonePage() {
  const t = useT()
  const navigate = useNavigate()
  const { instagram } = useAuth()
  const { draft, reset } = usePostFlow()
  if (!draft.published) return <Navigate to="/" replace />

  const username = instagram.state === 'connected' ? instagram.account.username : null
  const link = username ? `https://www.instagram.com/${username}/` : 'https://www.instagram.com/'

  return (
    <Card className="success">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 22 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 4.7) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 7) * 0.12}s` }} />
        ))}
      </div>
      <div className="success-check">
        <Icon name="check" size={46} strokeWidth={2.6} />
      </div>
      <h1>{t('post.done.title')}</h1>
      <p className="muted" style={{ marginTop: 8 }}>{t('post.done.subtitle')}</p>
      <div className="stack">
        <a className="btn btn-primary btn-lg" href={link} target="_blank" rel="noreferrer">
          {t('post.done.view')} <Icon name="external" size={18} />
        </a>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            reset()
            navigate('/create')
          }}
        >
          {t('post.done.another')}
        </Button>
        <Button variant="ghost" onClick={() => { reset(); navigate('/') }}>
          {t('post.done.home')}
        </Button>
      </div>
    </Card>
  )
}
