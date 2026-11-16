import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FrameEmpty, PhoneFrame, ReelPreviewPanel } from '../components/reels/ReelPreviewPanel'
import { ReelStudioLayout } from '../components/reels/ReelStudioLayout'
import { StageList } from '../components/reels/StageList'
import { Banner, Button, Card } from '../components/ui'
import { errorMessage } from '../lib/api'
import { useReel, useReelStatus } from '../hooks/useReel'
import { isBuilding } from '../lib/reels'
import { useT } from '../i18n'
import { cancelReel, regenerateReel } from '../services/reels'

export function ReelGeneratingPage() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const [restart, setRestart] = useState(0)
  const { info, error: pollError } = useReelStatus(id, restart)
  const { reel } = useReel(id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = info?.status
  useEffect(() => {
    if (id && status && status !== 'FAILED' && status !== 'CANCELLED' && !isBuilding(status)) navigate(`/reels/${id}`, { replace: true })
  }, [id, status, navigate])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      setRestart((n) => n + 1)
    }
  }

  if (!id) return null
  const failed = status === 'FAILED'
  const cancelled = status === 'CANCELLED'
  const working = !failed && !cancelled

  const left = (
    <Card>
      {failed ? (
        <>
          <h2>{t('reels.generating.failedTitle')}</h2>
          <Banner tone="error">{info?.error ?? t('reels.generating.failedDefault')}</Banner>
          <div className="reel-actions">
            <Button loading={busy} onClick={() => void act(() => regenerateReel(id, { part: 'all' }))}>{t('reels.generating.retry')}</Button>
            <Link to="/reels" className="reel-link">{t('reels.generating.startOver')}</Link>
          </div>
        </>
      ) : cancelled ? (
        <>
          <h2>{t('reels.generating.cancelledTitle')}</h2>
          <p>{t('reels.generating.cancelledText')}</p>
          <div className="reel-actions">
            <Button loading={busy} onClick={() => void act(() => regenerateReel(id, { part: 'all' }))}>{t('reels.generating.makeAgain')}</Button>
            <Link to="/reels" className="reel-link">{t('reels.generating.anotherPhoto')}</Link>
          </div>
        </>
      ) : (
        <>
          <h2>{t('reels.generating.workingTitle')}</h2>
          <p>{t('reels.generating.workingText')}</p>
          {info ? <StageList stage={info.stage} /> : <div className="skeleton" style={{ height: 220 }} />}
          <div className="reel-actions">
            <Button variant="secondary" loading={busy} disabled={!info} onClick={() => void act(() => cancelReel(id))}>{t('reels.generating.cancel')}</Button>
          </div>
        </>
      )}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {pollError && working ? <Banner tone="warning">{t('reels.generating.keepTrying', { error: pollError })}</Banner> : null}
    </Card>
  )

  const preview = (
    <ReelPreviewPanel label={t('reels.generating.photoLabel')} caption={working ? t('reels.generating.photoCaption') : undefined}>
      <PhoneFrame scanning={working}>
        {reel?.sourceImageUrl ? <img className="phone-img" src={reel.sourceImageUrl} alt={reel.productName} /> : <FrameEmpty>{t('reels.generating.loadingPhoto')}</FrameEmpty>}
      </PhoneFrame>
    </ReelPreviewPanel>
  )

  return <ReelStudioLayout step={2} reelId={id} title={t('reels.generating.title')} subtitle={t('reels.generating.subtitle')} left={left} preview={preview} />
}
