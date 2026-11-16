import { useEffect, useRef } from 'react'
import { useT } from '../i18n'

interface Props {
  readonly urls: string[]
  readonly index: number
  readonly onIndex: (i: number) => void
}

/** Swipeable photo viewer: native scroll-snap on touch, arrows and dots elsewhere. */
export function PhotoViewer({ urls, index, onIndex }: Props) {
  const t = useT()
  const track = useRef<HTMLDivElement>(null)
  const moving = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = track.current
    if (!el) return
    const target = index * el.clientWidth
    if (Math.abs(el.scrollLeft - target) < 2) return
    // Ignore scroll events caused by our own smooth scroll, or they would fight the target.
    if (moving.current) clearTimeout(moving.current)
    moving.current = setTimeout(() => (moving.current = null), 450)
    el.scrollTo({ left: target, behavior: 'smooth' })
  }, [index, urls.length])

  const onScroll = () => {
    const el = track.current
    if (!el || moving.current) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index && i >= 0 && i < urls.length) onIndex(i)
  }

  const go = (i: number) => onIndex(Math.max(0, Math.min(urls.length - 1, i)))

  return (
    <div className="viewer">
      <div
        className="viewer-track"
        ref={track}
        onScroll={onScroll}
        tabIndex={0}
        aria-label={t('photo.viewer.region')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') go(index - 1)
          if (e.key === 'ArrowRight') go(index + 1)
        }}
      >
        {urls.map((url, i) => (
          <div className="viewer-slide" key={`${i}-${url}`}>
            <img src={url} alt={i === 0 ? t('photo.viewer.cover') : t('photo.viewer.photoN', { n: i + 1 })} draggable={false} />
          </div>
        ))}
      </div>
      {urls.length > 1 ? (
        <>
          <button type="button" className="viewer-arrow viewer-prev" aria-label={t('photo.viewer.previous')} disabled={index === 0} onClick={() => go(index - 1)}>‹</button>
          <button type="button" className="viewer-arrow viewer-next" aria-label={t('photo.viewer.next')} disabled={index === urls.length - 1} onClick={() => go(index + 1)}>›</button>
          <span className="viewer-count">{index + 1} / {urls.length}</span>
          <div className="viewer-dots">
            {urls.map((url, i) => (
              <button key={`${i}-${url}`} type="button" className={i === index ? 'on' : ''} aria-label={t('photo.viewer.show', { n: i + 1 })} onClick={() => go(i)} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
