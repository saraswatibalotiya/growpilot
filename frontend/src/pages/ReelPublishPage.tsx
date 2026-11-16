import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/reels/ConfirmDialog'
import { ReelVideoPanel } from '../components/reels/ReelPreviewPanel'
import { ReelStudioLayout } from '../components/reels/ReelStudioLayout'
import { Banner, Button, Card, Spinner } from '../components/ui'
import { InstagramGlyph } from '../components/Icon'
import { useT } from '../i18n'
import { useReel } from '../hooks/useReel'
import { publishErrorMessage, REEL_SECONDS } from '../lib/reels'
import { approveReel, publishReel } from '../services/reels'
import { useAuth } from '../state/AuthContext'

/** Used for both /reels/:id/publish and /reels/:id/published. Success is shown only when the backend says PUBLISHED. */
export function ReelPublishPage() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const { instagram } = useAuth()
  const { reel, setReel, error, loading, reload } = useReel(id, (r) => r.status === 'PUBLISHING')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  if (loading) return <div className="reel-center"><Spinner /></div>
  if (!reel || !id) return <Banner tone="error">{error ?? t('reels.common.notFound')}</Banner>

  const account = instagram.state === 'connected' ? instagram.account : null
  const status = reel.status
  const retrySafe = status === 'PUBLISH_FAILED' && !reel.publishAmbiguous
  const canPublish = (status === 'APPROVED' || retrySafe) && account !== null

  const publish = async () => {
    setBusy(true)
    setPublishError(null)
    try {
      setReel(await publishReel(id))
    } catch (e) {
      setPublishError(publishErrorMessage(e))
      reload()
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  const approve = async () => {
    setBusy(true)
    setPublishError(null)
    try {
      setReel(await approveReel(id))
    } catch (e) {
      setPublishError(publishErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const left = (
    <>
      <Link to={`/reels/${id}`} className="reel-link">{t('reels.common.backToReel')}</Link>
          {status === 'PUBLISHED' ? (
            <Card>
              <Banner tone="success">{reel.publishedAt ? t('reels.publish.publishedOn', { date: new Date(reel.publishedAt).toLocaleString() }) : t('reels.publish.published')}</Banner>
              <div className="reel-actions is-wrap">
                {reel.permalink ? <a className="btn btn-primary" href={reel.permalink} target="_blank" rel="noreferrer">{t('reels.preview.viewOnInstagram')}</a> : <p className="field-hint">{t('reels.publish.noLink')}</p>}
                <Button variant="secondary" onClick={() => navigate('/reels')}>{t('reels.publish.createAnother')}</Button>
              </div>
            </Card>
          ) : status === 'PUBLISHING' ? (
            <Card>
              <div className="reel-publishing" role="status" aria-live="polite">
                <Spinner />
                <div>
                  <strong>{t('reels.publish.publishing')}</strong>
                  <p>{t('reels.publish.publishingText')}</p>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {status === 'PUBLISH_FAILED' ? (
                <Banner tone="error">
                  {reel.error ?? t('reels.publish.failedDefault')}{' '}
                  {reel.publishAmbiguous ? t('reels.publish.ambiguous') : retrySafe ? t('reels.publish.safeRetry') : ''}
                </Banner>
              ) : null}
              {publishError ? <Banner tone="error">{publishError}</Banner> : null}
              {status === 'READY' ? (
                <Banner tone="info">
                  {t('reels.publish.needsApproval')} <button type="button" className="reel-inline" disabled={busy} onClick={() => void approve()}>{t('reels.publish.approveIt')}</button> {t('reels.publish.or')} <Link to={`/reels/${id}`}>{t('reels.publish.goBack')}</Link>.
                </Banner>
              ) : null}
              {!['READY', 'APPROVED', 'PUBLISH_FAILED'].includes(status) ? <Banner tone="info">{t('reels.publish.cantPublish', { status: t(`reels.status.${status}`) })}</Banner> : null}

              <Card>
                <h2 className="card-title">{t('reels.publish.account')}</h2>
                {account ? (
                  <p className="reel-account"><InstagramGlyph size={18} /> @{account.username ?? account.displayName ?? t('reels.publish.yourAccount')}</p>
                ) : (
                  <Banner tone="warning">{instagram.state === 'problem' ? t('reels.publish.needsAttention') : t('reels.publish.notConnected')} <Link to="/settings">{t('reels.publish.openSettings')}</Link>.</Banner>
                )}
                <h2 className="card-title" style={{ marginTop: 16 }}>{t('reels.publish.captionTitle')}</h2>
                <p className="reel-script" lang={reel.language}>{reel.caption}</p>
                {reel.hashtags.length ? <p className="reel-tags">{reel.hashtags.join(' ')}</p> : null}
                <p className="field-hint">{t('reels.publish.verticalReel', { n: reel.durationSeconds ?? REEL_SECONDS })}</p>
              </Card>
              <Button size="lg" icon="reel" disabled={!canPublish || busy} onClick={() => setConfirm(true)}>
                {retrySafe ? t('reels.publish.tryAgain') : t('reels.publish.publish')}
              </Button>
            </>
          )}
    </>
  )

  return (
    <>
      <ReelStudioLayout step={5} reelId={id} title={status === 'PUBLISHED' ? t('reels.publish.titleLive') : t('reels.publish.titleReady')} left={left} preview={<ReelVideoPanel reel={reel} />} />
      <ConfirmDialog open={confirm} title={t('reels.publish.confirmTitle')} confirmLabel={t('reels.publish.confirmLabel')} busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void publish()}>
        {account ? t('reels.publish.confirmBodyFrom', { user: account.username ?? t('reels.publish.yourAccount') }) : t('reels.publish.confirmBody')}
      </ConfirmDialog>
    </>
  )
}
