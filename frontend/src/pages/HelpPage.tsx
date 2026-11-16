import { useT } from '../i18n'

const FAQ_IDS = ['makePost', 'languages', 'approval', 'mic', 'accounts']

export function HelpPage() {
  const t = useT()
  return (
    <>
      <div className="page-head">
        <h1>{t('help.title')}</h1>
        <p>{t('help.subtitle')}</p>
      </div>
      <div className="help-list">
        {FAQ_IDS.map((id) => (
          <details key={id}>
            <summary>{t(`help.faq.${id}.q`)}</summary>
            <p>{t(`help.faq.${id}.a`)}</p>
          </details>
        ))}
      </div>
    </>
  )
}
