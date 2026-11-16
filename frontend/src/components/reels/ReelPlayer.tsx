import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export async function downloadVideo(url: string, name: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('download failed')
    const href = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = href
    a.download = name
    a.click()
    URL.revokeObjectURL(href)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

export function ReelPlayer({ src, poster, title, compact }: { src: string; poster?: string | null; title: string; compact?: boolean }) {
  const t = useT()
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [full, setFull] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(() => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play().catch(() => setPlaying(false))
    else v.pause()
  }, [])

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }

  const download = (e: MouseEvent) => {
    e.preventDefault()
    void downloadVideo(src, `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'reel'}.mp4`)
  }

  return (
    <div className={`reel-player ${compact ? 'is-compact' : ''}`} ref={frame}>
      <div className="reel-frame">
        {failed ? (
          <div className="reel-fail" role="alert">{t('reels.player.loadFailed')}</div>
        ) : (
          <video
            ref={video}
            src={src}
            poster={poster ?? undefined}
            playsInline
            preload="metadata"
            aria-label={t('reels.player.videoLabel', { title })}
            onClick={toggle}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setFailed(true)}
          />
        )}
        {!playing && !failed ? (
          <button type="button" className="reel-bigplay" onClick={toggle} aria-label={t('reels.player.playReel')}>
            <Icon name="play" size={30} />
          </button>
        ) : null}
      </div>
      <div className="reel-controls">
        <button type="button" className="reel-ctl" onClick={toggle} aria-label={playing ? t('reels.player.pause') : t('reels.player.play')} disabled={failed}>
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        <input
          type="range"
          className="reel-seek"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => {
            const t = Number(e.target.value)
            if (video.current) video.current.currentTime = t
            setTime(t)
          }}
          aria-label={t('reels.player.seek')}
          aria-valuetext={t('reels.player.seekValue', { time: clock(time), total: clock(duration) })}
          disabled={failed || !duration}
        />
        <span className="reel-time" aria-hidden="true">{clock(time)} / {clock(duration)}</span>
        <button type="button" className="reel-ctl" onClick={() => { setMuted((m) => !m); if (video.current) video.current.muted = !muted }} aria-label={muted ? t('reels.player.unmute') : t('reels.player.mute')} aria-pressed={muted}>
          <Icon name={muted ? 'mute' : 'volume'} size={20} />
        </button>
        <button type="button" className="reel-ctl" onClick={fullscreen} aria-label={full ? t('reels.player.exitFullScreen') : t('reels.player.fullScreen')}>
          <Icon name="expand" size={20} />
        </button>
        <a className="reel-ctl" href={src} download onClick={download} aria-label={t('reels.player.download')}>
          <Icon name="download" size={20} />
        </a>
      </div>
    </div>
  )
}
