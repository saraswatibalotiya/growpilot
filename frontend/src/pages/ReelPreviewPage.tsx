import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/reels/ConfirmDialog'
import { ReelVideoPanel } from '../components/reels/ReelPreviewPanel'
import { ReelStudioLayout } from '../components/reels/ReelStudioLayout'
import { ReelStatusBadge } from '../components/reels/ReelStatusBadge'
import { TemplateStrip } from '../components/reels/TemplateStrip'
import { Banner, Button, Card, Field, Spinner, languageName } from '../components/ui'
import { errorMessage } from '../lib/api'
import { isBuilding, isStale, REEL_SECONDS, staleFix, templateName } from '../lib/reels'
import { useT } from '../i18n'
import { useReel } from '../hooks/useReel'
import { approveReel, regenerateReel, updateReel, type ReelTemplate, type RegeneratePart } from '../services/reels'

const parseTags = (v: string): string[] => v.split(/[\s,]+/).filter(Boolean)

export function ReelPreviewPage() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const { reel, setReel, error, loading } = useReel(id)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [synced, setSynced] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [changing, setChanging] = useState(false)
  const [template, setTemplate] = useState<ReelTemplate>('SHOWCASE')
  const [confirmAll, setConfirmAll] = useState(false)

  useEffect(() => {
    if (!reel || synced === reel.updatedAt) return
    setSynced(reel.updatedAt)
    setCaption(reel.caption ?? '')
    setTags(reel.hashtags.join(' '))
    setTemplate(reel.template)
  }, [reel, synced])

  useEffect(() => {
    if (id && reel && isBuilding(reel.status)) navigate(`/reels/${id}/generating`, { replace: true })
  }, [id, reel, navigate])

  if (loading) return <div className="reel-center"><Spinner /></div>
  if (!reel || !id) return <Banner tone="error">{error ?? t('reels.common.notFound')}</Banner>

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const regenerate = (part: RegeneratePart) =>
    run(async () => {
      await regenerateReel(id, { part })
      navigate(`/reels/${id}/generating`)
    })

  const tagList = parseTags(tags)
  const dirty = caption.trim() !== (reel.caption ?? '') || tagList.join(' ') !== reel.hashtags.join(' ')
  const live = reel.status === 'PUBLISHING' || reel.status === 'PUBLISHED'
  const editable = ['READY', 'APPROVED', 'FAILED'].includes(reel.status)
  const fix = staleFix(reel)
  const canApprove = (reel.status === 'READY' || reel.status === 'APPROVED') && Boolean(reel.videoUrl) && !isStale(reel)

  const saveText = () =>
    run(async () => {
      const next = await updateReel(id, { caption: caption.trim(), hashtags: tagList })
      setReel(next)
      setSaved(true)
    })

  const looksGood = () =>
    run(async () => {
      if (reel.status === 'READY') setReel(await approveReel(id))
      navigate(`/reels/${id}/publish`)
    })

  const applyTemplate = () =>
    run(async () => {
      if (template !== reel.template) await updateReel(id, { template })
      await regenerateReel(id, { part: 'video' })
      navigate(`/reels/${id}/generating`)
    })

  const left = (
    <>
          {reel.status === 'PUBLISHED' ? (
            <Banner tone="success">{t('reels.preview.publishedBanner')} {reel.permalink ? <a href={reel.permalink} target="_blank" rel="noreferrer">{t('reels.preview.viewOnInstagram')}</a> : null}</Banner>
          ) : null}
          {reel.status === 'PUBLISH_FAILED' ? <Banner tone="warning">{t('reels.preview.publishFailedBanner')}</Banner> : null}
          {fix && editable ? (
            <Banner tone="warning">
              {t('reels.preview.staleIntro')} {fix.part === 'script' ? t('reels.preview.staleScript') : t('reels.preview.staleVideo')}{' '}
              <button type="button" className="reel-inline" disabled={busy} onClick={() => void regenerate(fix.part)}>{fix.label}</button>
            </Banner>
          ) : null}
          {actionError ? <Banner tone="error">{actionError}</Banner> : null}

          <Card>
            <div className="reel-meta">
              <ReelStatusBadge status={reel.status} />
              <span>{templateName(reel.template)}</span>
              <span>{languageName(reel.language)}</span>
              <span>{t('reels.common.seconds', { n: reel.durationSeconds ?? REEL_SECONDS })}</span>
            </div>
            {reel.scenes.length ? (
              <>
                <h2 className="card-title">{t('reels.preview.onScreenText')}</h2>
                <ol className="reel-scenes">
                  {reel.scenes.map((s, i) => (
                    <li key={i} lang={reel.language}>
                      <span className="reel-scene-time">{t('reels.common.secondsShort', { n: `${s.startSec}–${s.endSec}` })}</span>
                      <strong>{s.label}</strong> {s.text}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </Card>

          <Card>
            <h2 className="card-title">{t('reels.preview.captionHashtags')}</h2>
            <Field label={t('reels.common.caption')} htmlFor="rc">
              <textarea id="rc" className="textarea" rows={4} maxLength={2200} value={caption} disabled={!editable || busy} lang={reel.language} onChange={(e) => { setCaption(e.target.value); setSaved(false) }} />
            </Field>
            <Field label={t('reels.preview.hashtags')} htmlFor="rh" hint={t('reels.preview.hashtagsHint')}>
              <input id="rh" className="input" value={tags} disabled={!editable || busy} onChange={(e) => { setTags(e.target.value); setSaved(false) }} />
            </Field>
            {editable ? (
              <div className="reel-actions">
                <Button variant="secondary" size="sm" loading={busy} disabled={!dirty || !caption.trim() || tagList.length > 15} onClick={() => void saveText()}>{t('reels.preview.save')}</Button>
                {saved && !dirty ? <span className="reel-saved" role="status">{t('reels.preview.saved')}</span> : null}
              </div>
            ) : null}
          </Card>

          {!live ? (
            <Card>
              <div className="reel-actions is-wrap">
                <Button size="lg" iconEnd="arrow" disabled={!canApprove} loading={busy} onClick={() => void looksGood()}>{t('reels.preview.looksGood')}</Button>
                <Button variant="secondary" icon="edit" disabled={!editable} onClick={() => navigate(`/reels/${id}/edit`)}>{t('reels.preview.editReel')}</Button>
                <Button variant="secondary" disabled={!editable} aria-expanded={changing} onClick={() => setChanging((c) => !c)}>{t('reels.preview.changeTemplate')}</Button>
                <Button variant="ghost" disabled={!['READY', 'APPROVED', 'FAILED', 'CANCELLED'].includes(reel.status)} onClick={() => setConfirmAll(true)}>{t('reels.preview.regenerate')}</Button>
              </div>
              {!canApprove && editable ? <p className="field-hint" style={{ marginTop: 10 }}>{t('reels.preview.approvalHint')}</p> : null}
              {changing ? (
                <div className="reel-template-change">
                  <TemplateStrip value={template} onChange={setTemplate} imageUrl={reel.sourceImageUrl} disabled={busy} />
                  <Button loading={busy} disabled={template === reel.template && !reel.stale.video} onClick={() => void applyTemplate()}>{t('reels.preview.apply')}</Button>
                </div>
              ) : null}
            </Card>
          ) : null}
    </>
  )

  const note = <Banner tone={reel.status === 'FAILED' ? 'error' : 'info'}>{reel.error ?? t('reels.preview.noVideoNote')}</Banner>

  return (
    <>
      <ReelStudioLayout step={3} reelId={id} title={reel.productName} subtitle={t('reels.preview.subtitle')} left={left} preview={<ReelVideoPanel reel={reel} note={note} />} />
      <ConfirmDialog open={confirmAll} title={t('reels.preview.confirmTitle')} confirmLabel={t('reels.preview.confirmLabel')} busy={busy} onCancel={() => setConfirmAll(false)} onConfirm={() => void regenerate('all').then(() => setConfirmAll(false))}>
        {t('reels.preview.confirmBody')}
      </ConfirmDialog>
    </>
  )
}
