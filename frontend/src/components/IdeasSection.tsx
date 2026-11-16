import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFeaturedIdeas, type RecommendedIdea } from '../services/recommendations'
import { useT } from '../i18n'
import { useStartIdea } from '../hooks/useStartIdea'
import { useAuth } from '../state/AuthContext'
import { Button } from './ui'
import { IdeaCard } from './IdeaCard'

/** "Not sure what to say?" on the dashboard. Sits between the voice composer and Recent Posts. */
export function IdeasSection() {
  const t = useT()
  const navigate = useNavigate()
  const startIdea = useStartIdea()
  const { business } = useAuth()
  const [ideas, setIdeas] = useState<RecommendedIdea[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getFeaturedIdeas(business?.category).then((list) => {
      if (!cancelled) setIdeas(list)
    })
    return () => {
      cancelled = true
    }
  }, [business?.category, t])

  return (
    <section className="ideas" aria-labelledby="ideas-title">
      <div className="ideas-head">
        <div className="ideas-intro">
          <span className="ideas-spark" aria-hidden="true">
            ✦
          </span>
          <div>
            <h2 id="ideas-title">{t('ideas.section.title')}</h2>
            <p>{t('ideas.section.subtitle')}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" iconEnd="arrow" onClick={() => navigate('/recommendations')}>
          {t('ideas.section.exploreMore')}
        </Button>
      </div>
      <div className="ideas-row" role="list">
        {ideas === null
          ? Array.from({ length: 5 }, (_, i) => <div role="listitem" key={i} className="idea-card skeleton" aria-hidden="true" />)
          : ideas.map((idea) => (
              <div role="listitem" key={idea.id} className="ideas-item">
                <IdeaCard title={idea.title} description={idea.description} icon={idea.icon} onUse={() => startIdea(idea.prompt)} />
              </div>
            ))}
      </div>
    </section>
  )
}
