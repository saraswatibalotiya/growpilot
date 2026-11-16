import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import { Banner } from '../ui'
import { Icon } from '../Icon'
import { REEL_SECONDS } from '../../lib/reels'
import type { Reel } from '../../services/reels'
import { ReelPlayer } from './ReelPlayer'

export function PhoneFrame({ children, scanning }: { children: ReactNode; scanning?: boolean }) {
  return (
    <div className="phone">
      <div className="phone-screen">
        {children}
        {scanning ? <div className="phone-scan" aria-hidden="true" /> : null}
      </div>
    </div>
  )
}

export function FrameEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="phone-empty">
      <Icon name="reel" size={36} />
      <span>{children}</span>
    </div>
  )
}

/** The right-hand panel that stays in place for every step of the Reel flow. */
export function ReelPreviewPanel({ seconds = REEL_SECONDS, label, caption, tip, children }: { seconds?: number; label?: string; caption?: ReactNode; tip?: string; children: ReactNode }) {
  const t = useT()
  return (
    <>
      <section className="rp">
        <div className="rp-head">
          <h2><Icon name="play" size={14} /> {t('reels.panel.title')}</h2>
          <span className="rp-chip">{seconds}s</span>
        </div>
        {label ? <span className="rp-label">{label}</span> : null}
        <div className="rp-stage">{children}</div>
        {caption ? <p className="rp-caption">{caption}</p> : null}
      </section>
      {tip ? (
        <p className="rp-tip"><Icon name="bulb" size={18} /> <span><strong>{t('reels.panel.tip')}</strong> {tip}</span></p>
      ) : null}
    </>
  )
}

/** Real video when it exists, otherwise the owner's photo. Used by preview, edit and publish. */
export function ReelVideoPanel({ reel, caption, note }: { reel: Reel; caption?: ReactNode; note?: ReactNode }) {
  const t = useT()
  const still = reel.thumbnailUrl ?? reel.sourceImageUrl
  return (
    <ReelPreviewPanel seconds={reel.durationSeconds ?? REEL_SECONDS} caption={caption}>
      {reel.videoUrl ? (
        <ReelPlayer src={reel.videoUrl} poster={reel.thumbnailUrl} title={reel.productName} />
      ) : (
        <PhoneFrame>{still ? <img className="phone-img" src={still} alt={reel.productName} /> : <FrameEmpty>{t('reels.panel.noVideo')}</FrameEmpty>}</PhoneFrame>
      )}
      {!reel.videoUrl && note ? <div className="rp-note">{note}</div> : null}
      {!reel.videoUrl && !note ? <div className="rp-note"><Banner tone="info">{t('reels.panel.noVideoNote')}</Banner></div> : null}
    </ReelPreviewPanel>
  )
}
