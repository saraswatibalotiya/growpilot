import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { InstagramGlyph } from '../components/Icon'
import { PosterPreview } from '../components/PosterPreview'
import { Banner, Button, Card } from '../components/ui'
import { ApiError, NotAvailableError, errorMessage } from '../lib/api'
import { features } from '../lib/features'
import { publishPost } from '../services/publishing'
import { updatePost } from '../services/posts'
import { translate, useT } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { usePostFlow } from '../state/PostFlowContext'

/**
 * The only screen that can publish. It never reports success on its own: success is shown only when the
 * backend returns a post with status PUBLISHED. Any other outcome is shown as what it is.
 */
export function PublishPage() {
  const t = useT()
  const navigate = useNavigate()
  const { business, instagram } = useAuth()
  const { draft, update } = usePostFlow()
  const [busy, setBusy] = useState(false)
  const [format, setFormat] = useState<'post' | 'reel'>('post')
  const [error, setError] = useState<string | null>(null)

  if (!draft.post || !draft.content) return <Navigate to="/create" replace />
  const content = draft.content
  const account = instagram.state === 'connected' ? instagram.account : null

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      // 1. Record the owner's approval on the server. The server decides whether this post may be approved.
      try {
        await updatePost(draft.post!.id, { status: 'USER_APPROVED' })
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setError(translate('post.publish.notApproved'))
          return
        }
        throw e
      }
      // 2. Publish. Real call only. There is no pretend path.
      const published = await publishPost(draft.post!.id, format)
      if (published.status !== 'PUBLISHED') {
        setError(translate('post.publish.notConfirmed', { status: published.status }))
        return
      }
      update({ published })
      navigate('/create/done', { replace: true })
    } catch (e) {
      setError(e instanceof NotAvailableError ? e.message : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="confirm">
      <div className="page-head">
        <Button variant="ghost" icon="back" onClick={() => navigate('/create/preview')}>
          {t('post.publish.back')}
        </Button>
        <h1 style={{ marginTop: 8 }}>{t('post.publish.title')}</h1>
        <p>{account ? t('post.publish.sharedFrom', { account: `@${account.username ?? t('post.publish.yourAccount')}` }) : t('post.publish.connectToPublish')}</p>
      </div>

      {!features.publishing ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="warning">
            <strong>{t('post.publish.offTitle')}</strong> {t('post.publish.offBody')}
          </Banner>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <div className="preview-grid">
        <PosterPreview shopName={business?.name ?? t('post.shopFallback')} photoUrl={draft.photoUrl} photoUrls={draft.photoUrls} posterUrl={draft.post.posterImageUrl} content={content} />
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="ig-account">
            <InstagramGlyph size={24} />
            {account ? `@${account.username ?? 'instagram'}` : <span className="muted">{t('post.publish.noAccount')}</span>}
            {!account ? <Link to="/settings" style={{ marginLeft: 'auto' }}>{t('post.publish.connect')}</Link> : null}
          </div>
          <Card>
            <h3 style={{ marginBottom: 8 }}>{content.headline}</h3>
            <p className="caption-box">{content.caption}</p>
            <div className="hashtags" style={{ marginTop: 12 }}>
              {content.hashtags.map((h) => (
                <span className="tag" key={h}>
                  {h}
                </span>
              ))}
            </div>
          </Card>
          <Card>
            <h3 style={{ marginBottom: 8 }}>{t('post.publish.shareAs')}</h3>
            <div className="chips" role="group" aria-label={t('post.publish.shareAs')}>
              <button type="button" className="chip" aria-pressed={format === 'post'} disabled={busy} onClick={() => setFormat('post')}>
                {t('post.publish.formatPost')}
              </button>
              <button type="button" className="chip" aria-pressed={format === 'reel'} disabled={busy} onClick={() => setFormat('reel')}>
                {t('post.publish.formatReel')}
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
              {format === 'reel' ? t('post.publish.reelHint') : t('post.publish.postHint')}
            </p>
          </Card>
          <div className="actions" style={{ marginTop: 0 }}>
            <Button variant="secondary" size="lg" onClick={() => navigate('/create/preview')} disabled={busy}>
              {t('post.publish.cancel')}
            </Button>
            <Button size="lg" iconEnd="arrow" loading={busy} disabled={!account} onClick={() => void publish()}>
              {t('post.publish.now')}
            </Button>
          </div>
          <p className="muted" style={{ fontSize: '0.82rem' }}>{t('post.publish.consent')}</p>
        </div>
      </div>
    </div>
  )
}
