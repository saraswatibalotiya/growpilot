import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ConfirmDialog } from '../components/reels/ConfirmDialog'
import { Banner, Button, Card, EmptyState, Spinner, StatusBadge } from '../components/ui'
import { errorMessage } from '../lib/api'
import type { Post, PostStatus } from '../lib/types'
import { listSyncRuns, startMediaSync, type SyncRun } from '../services/instagram'
import { deletePost, getPost, listPosts, updatePost } from '../services/posts'
import { useT } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { usePostFlow } from '../state/PostFlowContext'

/** Posts the owner can still change. An approved draft is reopened (it needs approving again). */
const PENDING: PostStatus[] = ['DRAFT', 'CONTENT_GENERATED', 'PREVIEW_READY']
const SECTIONS: { key: string; hasHint?: boolean; statuses: PostStatus[] }[] = [
  { key: 'pending', hasHint: true, statuses: PENDING },
  { key: 'approved', hasHint: true, statuses: ['USER_APPROVED'] },
  { key: 'published', statuses: ['PUBLISHING', 'PUBLISHED'] },
  { key: 'failed', statuses: ['FAILED'] },
]
const FILTERS = ['all', ...SECTIONS.map((s) => s.key)]
const PAGE = 50

function when(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function PostsPage() {
  const t = useT()
  const navigate = useNavigate()
  const { reset, update } = usePostFlow()
  const [filter, setFilter] = useState('all')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Post | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { instagram } = useAuth()
  const account = instagram.state === 'connected' || instagram.state === 'problem' ? instagram.account : null
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null)
  const mounted = useRef(true)
  // React runs effects twice in development (mount, unmount, mount), so the flag must be set on every mount.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Sections are built here, so everything is loaded (newest first), a page of 50 at a time.
      const all: Post[] = []
      for (let page = 1; page <= 4; page++) {
        const result = await listPosts(page, PAGE)
        all.push(...result.items)
        if (!result.hasMore) break
      }
      setPosts(all)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Starts a sync from Instagram, waits for it to finish (up to about 2 minutes), then reloads the list. */
  const resync = async () => {
    if (!account || syncing) return
    setSyncing(true)
    setSyncNote({ tone: 'info', text: t('posts.sync.running') })
    try {
      const { alreadyInProgress, run } = await startMediaSync(account.id)
      let current: SyncRun = run
      for (let i = 0; i < 60 && (current.status === 'queued' || current.status === 'running'); i++) {
        await new Promise((r) => setTimeout(r, 2000))
        if (!mounted.current) return
        current = (await listSyncRuns(account.id)).find((r) => r.id === run.id) ?? current
      }
      if (!mounted.current) return
      if (current.status === 'succeeded') {
        setSyncNote({ tone: 'success', text: `${t(current.itemsProcessed === 1 ? 'posts.sync.doneOne' : 'posts.sync.doneMany', { count: current.itemsProcessed })}${alreadyInProgress ? ` ${t('posts.sync.alreadyRunning')}` : ''}` })
        await load()
      } else if (current.status === 'failed') {
        setSyncNote({ tone: 'error', text: t('posts.sync.failed', { reason: current.errorMessage ?? current.errorCode ?? t('posts.sync.unknown') }) })
      } else {
        setSyncNote({ tone: 'info', text: t('posts.sync.still') })
      }
    } catch (e) {
      if (mounted.current) setSyncNote({ tone: 'error', text: errorMessage(e) })
    } finally {
      if (mounted.current) setSyncing(false)
    }
  }

  /** Loads the post into the create flow and opens it for editing. An approved draft is reopened first. */
  const edit = async (summary: Post) => {
    setOpening(summary.id)
    setError(null)
    try {
      let post = await getPost(summary.id)
      if (post.status === 'USER_APPROVED') post = await updatePost(post.id, { status: 'PREVIEW_READY' })
      const photoUrls = post.images?.map((i) => i.imageUrl) ?? (post.originalImageUrl ? [post.originalImageUrl] : [])
      const hasContent = !!post.caption && !!post.headline
      reset(post.language ?? undefined)
      update({
        photoUrls,
        photoUrl: photoUrls[0] ?? null,
        conversationId: post.conversationId,
        productId: post.productId,
        post: hasContent ? post : null,
        content: hasContent
          ? { headline: post.headline ?? '', caption: post.caption ?? '', callToAction: post.callToAction ?? '', hashtags: post.hashtags ?? [], productName: null, price: null, source: 'ai' }
          : null,
      })
      // A draft that never got its text goes back to the first step, with its photos already in place.
      navigate(hasContent ? '/create/preview' : '/create')
    } catch (e) {
      setError(errorMessage(e))
      setOpening(null)
    }
  }

  const remove = async () => {
    if (!toDelete) return
    setDeleting(true)
    setError(null)
    try {
      await deletePost(toDelete.id)
      setPosts((all) => all.filter((p) => p.id !== toDelete.id))
      setToDelete(null)
    } catch (e) {
      setError(errorMessage(e))
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const visible = SECTIONS.filter((s) => filter === 'all' || s.key === filter)
  const shownCount = visible.reduce((n, s) => n + posts.filter((p) => s.statuses.includes(p.status)).length, 0)

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1>{t('posts.title')}</h1>
          <p>{t('posts.subtitle')}</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          {account ? (
            <Button variant="secondary" loading={syncing} disabled={syncing} onClick={() => void resync()}>
              {t('posts.sync.button')}
            </Button>
          ) : null}
          <Button icon="plus" onClick={() => navigate('/create')}>
            {t('posts.new')}
          </Button>
        </div>
      </div>
      {syncNote ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone={syncNote.tone === 'success' ? 'success' : syncNote.tone === 'error' ? 'error' : 'info'}>{syncNote.text}</Banner>
        </div>
      ) : null}
      <div className="chips" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`posts.sections.${f}`)}
          </button>
        ))}
      </div>
      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="error">{error}</Banner>
          <div className="actions"><Button variant="secondary" onClick={() => void load()}>{t('posts.tryAgain')}</Button></div>
        </div>
      ) : null}
      {loading && posts.length === 0 ? (
        <Card pad={false}>
          <div style={{ padding: 36, display: 'grid', placeItems: 'center' }}>
            <Spinner />
          </div>
        </Card>
      ) : !error && shownCount === 0 ? (
        <Card pad={false}>
          <EmptyState icon="posts" title={t('posts.empty.title')} action={<Button onClick={() => navigate('/create')} icon="mic">{t('posts.empty.make')}</Button>}>
            {filter === 'all' ? t('posts.empty.all') : t('posts.empty.section')}
          </EmptyState>
        </Card>
      ) : (
        visible.map((section) => {
          const rows = posts.filter((p) => section.statuses.includes(p.status))
          if (rows.length === 0 && filter === 'all') return null
          const editable = section.key === 'pending' || section.key === 'approved'
          return (
            <section key={section.key} style={{ marginBottom: 26 }} aria-label={t(`posts.sections.${section.key}`)}>
              <h2 style={{ fontSize: '1.1rem', marginBottom: 2 }}>
                {t(`posts.sections.${section.key}`)} <span className="muted">({rows.length})</span>
              </h2>
              {section.hasHint ? <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 10px' }}>{t(`posts.hints.${section.key}`)}</p> : <div style={{ height: 10 }} />}
              <Card pad={false}>
                {rows.length === 0 ? <p className="muted" style={{ padding: 18 }}>{t('posts.nothingHere')}</p> : null}
                {rows.map((p) => {
                  const image = p.posterImageUrl ?? p.images?.[0]?.imageUrl ?? p.originalImageUrl
                  const count = p.images?.length ?? 0
                  return (
                    <div className="post-row" key={p.id}>
                      <div className="thumb" style={image ? { backgroundImage: `url("${image}")` } : undefined}>
                        {image ? null : <Icon name="posts" />}
                      </div>
                      <div>
                        <h3>{p.headline ?? p.caption?.slice(0, 60) ?? t('posts.untitled')}</h3>
                        <div className="post-meta">
                          {p.removedFromInstagram ? (
                            <span className="badge badge-neutral" title={t('posts.removedHint')}>{t('posts.removed')}</span>
                          ) : (
                            <StatusBadge status={p.status} />
                          )}
                          {count > 1 ? <span>{t('posts.photos', { count })}</span> : null}
                          <span>{when(p.publishedAt ?? p.createdAt)}</span>
                        </div>
                      </div>
                      <div className="actions" style={{ marginTop: 0 }}>
                        {editable ? (
                          <Button variant="secondary" size="sm" icon="edit" loading={opening === p.id} disabled={opening !== null} onClick={() => void edit(p)}>
                            {t('posts.edit')}
                          </Button>
                        ) : null}
                        {section.key === 'pending' ? (
                          <Button variant="secondary" size="sm" disabled={opening !== null || deleting} onClick={() => setToDelete(p)}>
                            {t('posts.delete')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </Card>
            </section>
          )
        })
      )}
      <ConfirmDialog open={toDelete !== null} title={t('posts.confirm.title')} confirmLabel={t('posts.confirm.yes')} busy={deleting} onCancel={() => setToDelete(null)} onConfirm={() => void remove()}>
        <p>{t('posts.confirm.body')}</p>
      </ConfirmDialog>
    </>
  )
}
