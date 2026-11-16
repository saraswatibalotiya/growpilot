import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LookPicker } from '../components/reels/LookPicker'
import { DictationField } from '../components/reels/DictationField'
import { ReelVideoPanel } from '../components/reels/ReelPreviewPanel'
import { ReelStudioLayout } from '../components/reels/ReelStudioLayout'
import { Banner, Button, Card, Field, Spinner } from '../components/ui'
import { errorMessage } from '../lib/api'
import { REEL_LANGUAGES } from '../lib/reels'
import { DEFAULT_CAPTION_LENGTH, DEFAULT_HASHTAG_LEVEL, TONES, type CaptionLength, type HashtagLevel, type Tone } from '../lib/tones'
import { ContentOptions } from '../components/ContentOptions'
import { ToneSelector } from '../components/ToneSelector'
import { useT } from '../i18n'
import { useReel } from '../hooks/useReel'
import { regenerateReel, updateReel, type ReelLanguage, type ReelLook, type UpdateReelInput } from '../services/reels'

export function ReelEditPage() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const { reel, error, loading } = useReel(id)
  const [language, setLanguage] = useState<ReelLanguage>('en')
  const [tone, setTone] = useState<Tone | null>(null)
  const [captionLength, setCaptionLength] = useState<CaptionLength>(DEFAULT_CAPTION_LENGTH)
  const [hashtagLevel, setHashtagLevel] = useState<HashtagLevel>(DEFAULT_HASHTAG_LEVEL)
  const [look, setLook] = useState<ReelLook>('FULL_PHOTO')
  const [instruction, setInstruction] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!reel || loaded) return
    setLoaded(true)
    setLanguage(reel.language)
    setLook(reel.look ?? 'FULL_PHOTO')
    setInstruction(reel.instruction ?? '')
    setTone(TONES.find((x) => x === reel.tone) ?? null)
    setCaptionLength(reel.captionLength ?? DEFAULT_CAPTION_LENGTH)
    setHashtagLevel(reel.hashtagLevel ?? DEFAULT_HASHTAG_LEVEL)
  }, [reel, loaded])

  if (loading) return <div className="reel-center"><Spinner /></div>
  if (!reel || !id) return <Banner tone="error">{error ?? t('reels.common.notFound')}</Banner>
  if (!['READY', 'APPROVED', 'FAILED'].includes(reel.status)) {
    return (
      <Banner tone="info">
        {t('reels.edit.cantEdit')} <Link to={`/reels/${id}`}>{t('reels.edit.backToTheReel')}</Link>
      </Banner>
    )
  }

  const langChanged = language !== reel.language
  const lookChanged = look !== (reel.look ?? 'FULL_PHOTO')
  const instructionChanged = instruction.trim() !== (reel.instruction ?? '')

  const go = async (patch: UpdateReelInput, part: 'script' | 'video', extra: { shorter?: boolean; tone?: Tone; captionLength?: CaptionLength; hashtagLevel?: HashtagLevel } = {}) => {
    setBusy(true)
    setActionError(null)
    try {
      if (instructionChanged) patch.instruction = instruction.trim()
      if (Object.keys(patch).length) await updateReel(id, patch)
      await regenerateReel(id, { part, ...extra })
      navigate(`/reels/${id}/generating`)
    } catch (e) {
      setActionError(errorMessage(e))
      setBusy(false)
    }
  }

  const toneArg = { ...(tone ? { tone } : {}), captionLength, hashtagLevel }

  const left = (
    <>
      {actionError ? <Banner tone="error">{actionError}</Banner> : null}
      <Link to={`/reels/${id}`} className="reel-link">{t('reels.common.backToReel')}</Link>
        <Card>
          <h2 className="card-title" id="el">{t('reels.common.language')}</h2>
          <div className="chips" role="radiogroup" aria-labelledby="el">
            {REEL_LANGUAGES.map((l) => (
              <button key={l.code} type="button" role="radio" aria-checked={language === l.code} aria-pressed={language === l.code} className="chip reel-chip" disabled={busy} onClick={() => setLanguage(l.code)} lang={l.code}>{l.native}</button>
            ))}
          </div>
          {langChanged ? (
            <div className="reel-actions">
              <p className="field-hint">{t('reels.edit.changingLanguage')}</p>
              <Button loading={busy} onClick={() => void go({ language }, 'script', toneArg)}>{t('reels.edit.changeLanguage')}</Button>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="card-title">{t('reels.edit.look')}</h2>
          <LookPicker value={look} onChange={setLook} disabled={busy} />
          {lookChanged ? (
            <div className="reel-actions">
              <p className="field-hint">{t('reels.edit.lookNote')}</p>
              <Button loading={busy} disabled={langChanged} onClick={() => void go({ look }, 'video')}>{t('reels.edit.applyLook')}</Button>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="card-title">{t('tones.title')}</h2>
          <ToneSelector value={tone} onChange={setTone} disabled={busy} />
          <ContentOptions captionLength={captionLength} hashtagLevel={hashtagLevel} onCaptionLength={setCaptionLength} onHashtagLevel={setHashtagLevel} disabled={busy} />
          <Field label={t('reels.edit.notesOptional')} htmlFor="ei">
            <DictationField id="ei" label={t('reels.edit.notes')} value={instruction} onChange={setInstruction} language={language} maxLength={300} disabled={busy} />
          </Field>
          <Button variant="secondary" loading={busy} disabled={langChanged} onClick={() => void go({}, 'script', toneArg)}>{t('reels.edit.rewrite')}</Button>
        </Card>
    </>
  )

  return (
    <ReelStudioLayout
      step={4}
      reelId={id}
      title={t('reels.edit.title')}
      subtitle={t('reels.edit.subtitle')}
      left={left}
      preview={<ReelVideoPanel reel={reel} caption={t('reels.edit.caption')} />}
    />
  )
}
