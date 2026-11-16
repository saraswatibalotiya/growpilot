import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IdeaCard } from '../components/IdeaCard'
import { Banner, Button, Spinner } from '../components/ui'
import { useT } from '../i18n'
import { useStartIdea } from '../hooks/useStartIdea'
import { useAuth } from '../state/AuthContext'
import { getRecommendationGroups, type RecommendationGroup } from '../services/recommendations'

const SHOP_CATEGORIES = ['clothing', 'jewellery', 'grocery', 'footwear']

export function RecommendationsPage() {
  const t = useT()
  const navigate = useNavigate()
  const startIdea = useStartIdea()
  const { business } = useAuth()
  const [groups, setGroups] = useState<RecommendationGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getRecommendationGroups(business?.category)
      .then((g) => !cancelled && setGroups(g))
      .catch(() => !cancelled && setError(t('ideas.page.loadError')))
    return () => {
      cancelled = true
    }
  }, [business?.category, t])

  return (
    <>
      <div className="page-head row-between">
        <div>
          <Button variant="ghost" icon="back" onClick={() => navigate('/')}>
            {t('ideas.page.back')}
          </Button>
          <h1 style={{ marginTop: 8 }}>{t('ideas.page.title')}</h1>
          <p>
            {business?.category
              ? t('ideas.page.forCategory', { category: SHOP_CATEGORIES.includes(business.category) ? t(`setup.categories.${business.category}`) : business.category })
              : t('ideas.page.forAny')}
          </p>
        </div>
      </div>

      {error ? (
        <Banner tone="error">{error}</Banner>
      ) : groups === null ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spinner />
        </div>
      ) : (
        <div className="idea-groups">
          {groups.map((g) => (
            <section key={g.group} className="idea-group" aria-labelledby={`grp-${g.group}`}>
              <h2 id={`grp-${g.group}`}>{g.label}</h2>
              <div className="idea-grid">
                {g.ideas.map((idea) => (
                  <IdeaCard key={idea.id} title={idea.title} description={idea.description} icon={idea.icon} onUse={() => startIdea(idea.prompt)} compact />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
