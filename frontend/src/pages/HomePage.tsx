import { useEffect, useState } from 'react'
import { useAuth } from '../state/AuthContext'
import { IdeasSection } from '../components/IdeasSection'
import { Link, useNavigate } from 'react-router-dom'
import { Banner, Button, Card, EmptyState, MicButton, Spinner, StatusBadge, Waveform } from '../components/ui'
import { Icon } from '../components/Icon'
import { translate, useT } from '../i18n'
import { errorMessage } from '../lib/api'
import type { Post } from '../lib/types'
import { listPosts } from '../services/posts'

function when(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? translate('home.today') : days === 1 ? translate('home.yesterday') : translate('home.daysAgo', { days })
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? translate('home.goodMorning') : h < 17 ? translate('home.goodAfternoon') : translate('home.goodEvening')
}

function PostRows({ posts }: { posts: Post[] }) {
  const t = useT()
  return (
    <>
      {posts.map((p) => {
        const image = p.posterImageUrl ?? p.originalImageUrl
        return (
          <div className="post-row" key={p.id}>
            <div className="thumb" style={image ? { backgroundImage: `url("${image}")` } : undefined}>
              {image ? null : <Icon name="posts" />}
            </div>
            <div>
              <h3>{p.headline ?? p.caption?.slice(0, 60) ?? t('home.untitled')}</h3>
              <div className="post-meta">
                <StatusBadge status={p.status} />
                <span>{when(p.publishedAt ?? p.createdAt)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

export function HomePage() {
  const t = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPosts(1, 3).then(
      (page) => !cancelled && setPosts(page.items),
      (e: unknown) => !cancelled && setError(errorMessage(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <section className="home-hero">
        <p className="eyebrow">{user ? t('home.greetingName', { greeting: greeting(), name: user.name.split(' ')[0] ?? '' }) : t('home.greeting', { greeting: greeting() })}</p>
        <h1>{t('home.title')}</h1>
        <p>{t('home.subtitle')}</p>
        <div className="home-mic">
          <Waveform />
          <MicButton recording={false} onClick={() => navigate('/create?mic=1')} label={t('home.tapToSpeak')} />
          <Waveform />
        </div>
        <div className="home-mic-caption">
          <strong>{t('home.tapToSpeak')}</strong>
          <span>{t('home.example')}</span>
        </div>
        <div className="home-cta">
          <Button size="lg" icon="sparkle" onClick={() => navigate('/create')}>
            {t('home.createPost')}
          </Button>
        </div>
      </section>

      <IdeasSection />

      <section aria-labelledby="recent">
        <div className="recent-head">
          <h2 id="recent">{t('home.recent')}</h2>
          <Link to="/posts">{t('home.viewAll')}</Link>
        </div>
        <Card pad={false}>
          {error ? (
            <div style={{ padding: 16 }}>
              <Banner tone="error">{error}</Banner>
            </div>
          ) : posts === null ? (
            <div style={{ padding: 28, display: 'grid', placeItems: 'center' }}>
              <Spinner />
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              icon="posts"
              title={t('home.noPosts')}
              action={
                <Button onClick={() => navigate('/create')} icon="mic">
                  {t('home.firstPost')}
                </Button>
              }
            >
              {t('home.noPostsHint')}
            </EmptyState>
          ) : (
            <PostRows posts={posts} />
          )}
        </Card>
      </section>
    </>
  )
}
