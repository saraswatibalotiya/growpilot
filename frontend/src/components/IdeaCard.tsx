import { useT } from '../i18n'
import { Icon, type IconName } from './Icon'
import { Button } from './ui'

export function IdeaCard({
  title,
  description,
  icon,
  onUse,
  compact = false,
}: {
  title: string
  description: string
  icon: IconName
  onUse: () => void
  compact?: boolean
}) {
  const t = useT()
  return (
    <article className={`idea-card ${compact ? 'is-compact' : ''}`}>
      <div className="idea-art" aria-hidden="true">
        <Icon name={icon} size={compact ? 26 : 34} strokeWidth={1.6} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <Button variant="secondary" size="sm" icon="mic" onClick={onUse} aria-label={t('ideas.useIdea', { title })} className="idea-use">
        {t('ideas.useThis')}
      </Button>
    </article>
  )
}
