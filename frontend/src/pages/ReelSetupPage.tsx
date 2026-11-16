import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { DictationField } from '../components/reels/DictationField'
import { LookPicker } from '../components/reels/LookPicker'
import { ImagePicker, type ReelExtra, type ReelSource } from '../components/reels/ImagePicker'
import { FrameEmpty, PhoneFrame, ReelPreviewPanel } from '../components/reels/ReelPreviewPanel'
import { ReelStudioLayout, StepCard } from '../components/reels/ReelStudioLayout'
import { TemplateOverlay } from '../components/reels/TemplateOverlay'
import { TemplateStrip } from '../components/reels/TemplateStrip'
import { Icon } from '../components/Icon'
import { Banner, Button, Field } from '../components/ui'
import { errorMessage } from '../lib/api'
import { radioKeys } from '../lib/radio'
import { REEL_LANGUAGES, REEL_SECONDS } from '../lib/reels'
import { ToneSelector } from '../components/ToneSelector'
import { useT } from '../i18n'
import { DEFAULT_CAPTION_LENGTH, DEFAULT_HASHTAG_LEVEL, type CaptionLength, type HashtagLevel, type Tone } from '../lib/tones'
import { ContentOptions } from '../components/ContentOptions'
import { createReel, type ReelLanguage, type ReelLook, type ReelTemplate } from '../services/reels'
import { useAuth } from '../state/AuthContext'

const PRICE = /^\d{1,10}(\.\d{1,2})?$/

export function ReelSetupPage() {
  const t = useT()
  const navigate = useNavigate()
  const { business } = useAuth()
  const [source, setSource] = useState<ReelSource | null>(null)
  const [extras, setExtras] = useState<ReelExtra[]>([])
  const [language, setLanguage] = useState<ReelLanguage>(business?.preferredLanguage ?? 'en')
  const [tone, setTone] = useState<Tone | null>(null)
  const [captionLength, setCaptionLength] = useState<CaptionLength>(DEFAULT_CAPTION_LENGTH)
  const [hashtagLevel, setHashtagLevel] = useState<HashtagLevel>(DEFAULT_HASHTAG_LEVEL)
  const [template, setTemplate] = useState<ReelTemplate>('SHOWCASE')
  // null = let the app choose: the enhanced photo when AI is available, otherwise the free look.
  const [look, setLook] = useState<ReelLook | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [offer, setOffer] = useState('')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (s: ReelSource | null) => {
    setSource(s)
    if (s) {
      setName(s.label)
      setPrice(s.price ?? '')
    }
  }

  const isOffer = template === 'SPECIAL_OFFER'
  const reasons: string[] = []
  if (!source) reasons.push(t('reels.setup.reasons.photo'))
  if (!name.trim()) reasons.push(t('reels.setup.reasons.name'))
  if (!tone) reasons.push(t('options.needTone'))
  if (price.trim() && !PRICE.test(price.trim())) reasons.push(t('reels.setup.reasons.price'))
  if (isOffer && !price.trim() && !offer.trim()) reasons.push(t('reels.setup.reasons.offer'))
  const ready = reasons.length === 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!source || !tone || !ready) return
    setBusy(true)
    setError(null)
    try {
      const reel = await createReel({
        ...(source.productId ? { productId: source.productId } : { mediaAssetId: source.mediaAssetId }),
        ...(extras.length ? { extraMediaAssetIds: extras.map((x) => x.mediaAssetId) } : {}),
        language,
        template,
        tone,
        captionLength,
        hashtagLevel,
        ...(look ? { look } : {}),
        productName: name.trim(),
        ...(price.trim() ? { price: price.trim() } : {}),
        ...(offer.trim() ? { offerText: offer.trim() } : {}),
        ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
      })
      navigate(`/reels/${reel.id}/generating`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const priceField = (
    <Field label={isOffer ? t('reels.setup.price') : t('reels.setup.priceOptional')} htmlFor="rp" error={price.trim() && !PRICE.test(price.trim()) ? t('reels.setup.priceError') : null}>
      <input id="rp" className="input" inputMode="decimal" value={price} maxLength={20} onChange={(e) => setPrice(e.target.value)} placeholder="899" />
    </Field>
  )

  const left = (
    <form onSubmit={(e) => void submit(e)} noValidate className="studio-form">
      {error ? <Banner tone="error">{error}</Banner> : null}

      <StepCard n={1} title={t('reels.setup.steps.upload')} done={Boolean(source)}>
        <ImagePicker value={source} onChange={pick} extras={extras} onExtrasChange={setExtras} />
      </StepCard>

      <StepCard n={2} title={t('reels.setup.steps.template')}>
        <TemplateStrip value={template} onChange={setTemplate} imageUrl={source?.imageUrl} />
        {isOffer ? (
          <div className="offer-fields">
            {priceField}
            <Field label={t('reels.setup.offerWords')} htmlFor="ro" hint={t('reels.setup.offerHint')} error={null}>
              <input id="ro" className="input" value={offer} maxLength={80} onChange={(e) => setOffer(e.target.value)} lang={language} placeholder={t('reels.setup.offerPlaceholder')} />
            </Field>
          </div>
        ) : null}
      </StepCard>

      <StepCard n={3} title={t('reels.setup.steps.look')}>
        <LookPicker value={look} onChange={setLook} />
      </StepCard>

      <StepCard n={4} title={t('reels.setup.steps.language')}>
        <div className="seg" role="radiogroup" aria-label={t('reels.setup.reelLanguage')} onKeyDown={radioKeys}>
          {REEL_LANGUAGES.map((l) => (
            <button key={l.code} type="button" role="radio" aria-checked={language === l.code} tabIndex={language === l.code ? 0 : -1} className="seg-btn" onClick={() => setLanguage(l.code)}>
              <span lang={l.code}>{l.native}</span>
              {l.code !== 'en' && !/[\u0900-\u097F]/.test(t(l.labelKey)) ? <small>{t(l.labelKey)}</small> : null}
            </button>
          ))}
        </div>
        <p className="field-hint">{t('reels.setup.languageHint')}</p>
      </StepCard>

      <StepCard n={5} title={t('tones.title')}>
        <ToneSelector value={tone} onChange={setTone} />
        <ContentOptions captionLength={captionLength} hashtagLevel={hashtagLevel} onCaptionLength={setCaptionLength} onHashtagLevel={setHashtagLevel} />
      </StepCard>

      <StepCard n={6} title={t('reels.setup.steps.details')}>
        <div className="reel-fields">
          <Field label={t('reels.setup.productName')} htmlFor="rn">
            <input id="rn" className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} lang={language} />
          </Field>
          {isOffer ? null : priceField}
          <Field label={t('reels.setup.businessName')} htmlFor="rb">
            <input id="rb" className="input" value={business?.name ?? ''} readOnly />
          </Field>
          <Field label={t('reels.setup.instructionOptional')} htmlFor="ri">
            <DictationField id="ri" label={t('reels.setup.instruction')} value={instruction} onChange={setInstruction} language={language} rows={2} maxLength={300} placeholder={t('reels.setup.instructionPlaceholder')} />
          </Field>
          <span className="chip-fixed"><Icon name="reel" size={16} /> {t('reels.setup.duration', { n: REEL_SECONDS })}</span>
        </div>
      </StepCard>

      <div className="studio-cta">
        <Button type="submit" size="lg" iconEnd="arrow" loading={busy} disabled={!ready}>{t('reels.setup.create')}</Button>
        <span className="studio-quality"><Icon name="check" size={14} strokeWidth={3} /> {t('reels.setup.quality')}</span>
      </div>
      {!ready ? (
        <ul className="studio-reasons" aria-live="polite">
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      ) : null}
    </form>
  )

  const preview = (
    <ReelPreviewPanel
      label={t('reels.setup.preview.label')}
      caption={t('reels.setup.preview.caption')}
      tip={t('reels.setup.preview.tip')}
    >
      <PhoneFrame>
        {source ? <TemplateOverlay template={template} imageUrl={source.imageUrl} name={name} price={price} offer={offer} lang={language} /> : <FrameEmpty>{t('reels.setup.preview.empty')}</FrameEmpty>}
      </PhoneFrame>
    </ReelPreviewPanel>
  )

  return <ReelStudioLayout step={1} title={t('reels.setup.title')} subtitle={t('reels.setup.subtitle')} left={left} preview={preview} />
}
