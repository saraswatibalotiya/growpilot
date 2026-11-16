import { useState } from 'react'
import { useT } from '../i18n'
import type { GeneratedContent } from '../lib/types'

/**
 * Poster preview with the whole carousel. Slide 1 is the cover, drawn as a poster from the generated text.
 * The other slides are shown as the photos they are. If the backend has produced a real poster image it is used as the cover.
 */
export function PosterPreview({
  shopName,
  photoUrl,
  photoUrls,
  posterUrl,
  content,
}: {
  shopName: string
  photoUrl: string | null
  /** All carousel photos in order. Falls back to photoUrl alone. */
  photoUrls?: string[]
  posterUrl?: string | null
  content: Pick<GeneratedContent, 'headline' | 'callToAction' | 'price' | 'productName'>
}) {
  const t = useT()
  const photos = photoUrls && photoUrls.length > 0 ? photoUrls : photoUrl ? [photoUrl] : []
  const [shown, setShown] = useState(0)
  const index = Math.min(shown, Math.max(photos.length - 1, 0))
  const many = photos.length > 1
  const go = (to: number) => setShown((to + photos.length) % photos.length)

  const cover = index === 0
  const slide = posterUrl && cover ? (
    <img className="poster" src={posterUrl} alt={t('poster.preview.alt', { headline: content.headline })} style={{ objectFit: 'cover' }} />
  ) : (
    <div className="poster" role="img" aria-label={cover ? t('poster.preview.label', { headline: content.headline }) : t('poster.preview.photoOf', { n: index + 1, total: photos.length })}>
      {photos[index] ? <div className="poster-photo" style={{ backgroundImage: `url("${photos[index]}")`, ...(cover ? {} : { filter: 'none' }) }} /> : null}
      {cover ? (
        <>
          <span className="poster-stamp">{t('poster.preview.stamp')}</span>
          <div className="poster-top">{shopName}</div>
          <div className="poster-headline">{content.headline}</div>
          {content.productName ? <div className="poster-sub">{content.productName}</div> : null}
          <div className="poster-bottom">
            {content.price ? (
              <div className="poster-price">
                ₹{content.price}
                <small>{t('poster.preview.only')}</small>
              </div>
            ) : (
              <span />
            )}
            <span className="poster-cta">{content.callToAction}</span>
          </div>
        </>
      ) : (
        <span className="poster-stamp">{t('poster.preview.photoN', { n: index + 1 })}</span>
      )}
      {many ? <span className="poster-count">{index + 1} / {photos.length}</span> : null}
    </div>
  )

  if (!many) return slide
  return (
    <div className="poster-wrap">
      <div className="poster-stage">
        {slide}
        <button type="button" className="poster-nav prev" aria-label={t('photo.viewer.previous')} onClick={() => go(index - 1)}>‹</button>
        <button type="button" className="poster-nav next" aria-label={t('photo.viewer.next')} onClick={() => go(index + 1)}>›</button>
      </div>
      <div className="poster-thumbs" aria-label={t('poster.preview.all')}>
        {photos.map((url, i) => (
          <button type="button" key={`${i}-${url}`} className={i === index ? 'on' : ''} aria-label={t('photo.viewer.show', { n: i + 1 })} aria-current={i === index} onClick={() => setShown(i)}>
            <img src={url} alt="" />
          </button>
        ))}
      </div>
    </div>
  )
}
