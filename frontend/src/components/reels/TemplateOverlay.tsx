import { translateIn, useT, UI_LANGUAGES, type UiLanguage } from '../../i18n'
import type { ReelTemplate } from '../../services/reels'

/** CSS-only style preview of a template over the owner's photo. This is not the rendered video. */
export function TemplateOverlay({ template, imageUrl, name, price, offer, lang }: { template: ReelTemplate; imageUrl: string; name?: string; price?: string; offer?: string; lang?: string }) {
  const t = useT()
  // The sample text follows the Reel language when one is given.
  const sample = (key: string) => (lang && (UI_LANGUAGES as readonly string[]).includes(lang) ? translateIn(lang as UiLanguage, key) : t(key))
  const title = name?.trim() || sample('reels.overlay.product')
  const priceText = price?.trim() ? `₹${price.trim()}` : ''
  const offerText = offer?.trim() ?? ''
  const deal = offerText || priceText
  return (
    <div className={`ov ov-${template.toLowerCase().replace('_', '-')}`} aria-hidden="true" lang={lang}>
      <img className="ov-photo" src={imageUrl} alt="" />
      {template === 'SHOWCASE' ? (
        <div className="ov-in">
          <strong className="ov-name">{title}</strong>
          {priceText ? <span className="ov-chip">{priceText}</span> : null}
        </div>
      ) : null}
      {template === 'NEW_ARRIVALS' ? (
        <div className="ov-in">
          <span className="ov-kicker">{sample('reels.overlay.newArrivals')}</span>
          <strong className="ov-name">{title}</strong>
          {priceText ? <span className="ov-chip">{priceText}</span> : null}
        </div>
      ) : null}
      {template === 'SPECIAL_OFFER' ? (
        <div className="ov-in">
          <span className="ov-sale">{sample('reels.overlay.sale')}</span>
          <strong className="ov-name">{title}</strong>
          {deal ? <span className="ov-deal">{deal}</span> : null}
        </div>
      ) : null}
      {template === 'MINIMAL_PREMIUM' ? (
        <div className="ov-in">
          <strong className="ov-name">{title}</strong>
          <span className="ov-serif">{sample('reels.overlay.elegant')}</span>
        </div>
      ) : null}
    </div>
  )
}
