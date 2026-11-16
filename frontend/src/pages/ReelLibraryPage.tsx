import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReelStatusBadge } from '../components/reels/ReelStatusBadge'
import { downloadVideo } from '../components/reels/ReelPlayer'
import { Icon } from '../components/Icon'
import { Banner, Button, Card, EmptyState, Spinner, languageName } from '../components/ui'
import { errorMessage } from '../lib/api'
import { formatDate, templateName } from '../lib/reels'
import { useT } from '../i18n'
import { listReels, type Reel } from '../services/reels'

export function ReelLibraryPage() {
  const t = useT()
  const navigate = useNavigate()
  const [reels, setReels] = useState<Reel[] | null>(null)
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    setError(null)
    try {
      const res = await listReels(p)
      setReels((prev) => (p === 1 ? res.items : [...(prev ?? []), ...res.items]))
      setPage(p)
      setMore(res.hasMore)
    } catch (e) {
      setError(errorMessage(e))
      setReels((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    void load(1)
  }, [load])

  return (
    <>
      <div className="page-head">
        <h1>{t('reels.library.title')}</h1>
        <p>{t('reels.library.intro')} <Link to="/reels" className="reel-link">{t('reels.library.createNew')}</Link></p>
      </div>
      {error ? <div style={{ marginBottom: 16 }}><Banner tone="error">{error}</Banner> <Button variant="secondary" size="sm" onClick={() => void load(1)}>{t('reels.library.tryAgain')}</Button></div> : null}
      {reels === null ? (
        <div className="reel-center"><Spinner /></div>
      ) : reels.length === 0 && !error ? (
        <EmptyState icon="reel" title={t('reels.library.emptyTitle')} action={<Button onClick={() => navigate('/reels')}>{t('reels.library.emptyAction')}</Button>}>
          {t('reels.library.emptyText')}
        </EmptyState>
      ) : (
        <>
          <div className="reel-grid">
            {reels.map((r) => (
              <Card key={r.id} pad={false} className="reel-card">
                <Link to={r.status === 'QUEUED' || r.status === 'WRITING_SCRIPT' || r.status === 'GENERATING_VOICE' || r.status === 'RENDERING' ? `/reels/${r.id}/generating` : `/reels/${r.id}`} className="reel-thumb" aria-label={t('reels.library.open', { name: r.productName })}>
                  {r.thumbnailUrl ? <img src={r.thumbnailUrl} alt="" loading="lazy" /> : <div className="reel-thumb-empty"><Icon name="reel" size={32} /></div>}
                </Link>
                <div className="reel-card-body">
                  <div className="reel-card-top">
                    <strong>{r.productName}</strong>
                    <ReelStatusBadge status={r.status} />
                  </div>
                  <span className="reel-card-meta">{languageName(r.language)} · {templateName(r.template)} · {formatDate(r.createdAt)}</span>
                  <div className="reel-actions is-wrap">
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/reels/${r.id}`)}>{t('reels.library.previewBtn')}</Button>
                    {r.videoUrl ? <Button variant="ghost" size="sm" icon="download" onClick={() => void downloadVideo(r.videoUrl!, `${r.productName}.mp4`)}>{t('reels.library.download')}</Button> : null}
                    {r.status === 'APPROVED' ? <Button size="sm" onClick={() => navigate(`/reels/${r.id}/publish`)}>{t('reels.library.publish')}</Button> : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {more ? <div className="reel-more"><Button variant="secondary" loading={loadingMore} onClick={() => { setLoadingMore(true); void load(page + 1).finally(() => setLoadingMore(false)) }}>{t('reels.library.loadMore')}</Button></div> : null}
        </>
      )}
    </>
  )
}
