import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/api'
import { translate, useT } from '../i18n'
import type { Post } from '../lib/types'
import {
  editPoster,
  generatePoster,
  getPosterOptions,
  renderPoster,
  savePoster,
  type PhotoTreatment,
  type FontStyle,
  type PosterContext,
  type PosterDesign,
  type PosterResult,
  type PosterTemplateOption,
  type PricePosition,
} from '../services/poster'
import { Banner, Button, Card } from './ui'

/** Background looks the owner can pick. Text colour is repaired by the server if a dark one needs light text. */
const BACKGROUNDS: Array<{ id: string; swatch: string; apply: Pick<PosterDesign, 'backgroundStyle' | 'backgroundColor' | 'backgroundGradient'> }> = [
  { id: 'white', swatch: '#F5F6F8', apply: { backgroundStyle: 'solid', backgroundColor: '#F5F6F8', backgroundGradient: null } },
  { id: 'mist', swatch: 'linear-gradient(135deg,#FFFFFF,#E4E9F2)', apply: { backgroundStyle: 'gradient', backgroundColor: '#F2F4F9', backgroundGradient: { from: '#FFFFFF', to: '#E4E9F2', direction: 'diagonal' } } },
  { id: 'slate', swatch: 'linear-gradient(180deg,#2C313C,#171A22)', apply: { backgroundStyle: 'gradient', backgroundColor: '#22262F', backgroundGradient: { from: '#2C313C', to: '#171A22', direction: 'vertical' } } },
  { id: 'blush', swatch: 'linear-gradient(180deg,#FFF6F3,#FFD3CB)', apply: { backgroundStyle: 'gradient', backgroundColor: '#FFEAE6', backgroundGradient: { from: '#FFF6F3', to: '#FFD3CB', direction: 'vertical' } } },
  { id: 'sage', swatch: '#E3E9DE', apply: { backgroundStyle: 'solid', backgroundColor: '#E3E9DE', backgroundGradient: null } },
  { id: 'charcoal', swatch: '#2B2622', apply: { backgroundStyle: 'solid', backgroundColor: '#2B2622', backgroundGradient: null } },
]

const TREATMENTS: Array<{ id: PhotoTreatment }> = [
  { id: 'natural' },
  { id: 'brighter' },
  { id: 'vivid' },
  { id: 'soft' },
]

const FONTS: Array<{ id: FontStyle; css: string }> = [
  { id: 'auto', css: 'inherit' },
  { id: 'clean', css: "'Helvetica Neue', Arial, sans-serif" },
  { id: 'modern', css: "'Avenir Next', Futura, 'Century Gothic', sans-serif" },
  { id: 'elegant', css: "'Playfair Display', Didot, Georgia, serif" },
  { id: 'bold', css: "'Arial Black', Impact, sans-serif" },
  { id: 'friendly', css: "'Avenir Next Rounded', 'Trebuchet MS', Verdana, sans-serif" },
]

type Busy = 'generate' | 'render' | 'edit' | 'save' | null

/** Loads the picture into the browser cache first, so the preview swaps instantly instead of showing the old poster for a moment. */
function preload(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    const done = () => resolve()
    img.onload = done
    img.onerror = done // a failed preload must not block the owner; the preview will try again by itself
    setTimeout(done, 10_000)
    img.src = url
  })
}

export interface PosterStudioProps {
  post: Post
  photoUrl: string
  headline: string
  callToAction: string
  language: 'hi' | 'mr' | 'en'
  /** The poster currently shown in the preview (null = none yet). */
  onPoster: (poster: { id: string; url: string } | null) => void
  /** The post after a poster was saved onto it. */
  onSaved: (post: Post) => void
}

/**
 * Poster panel for the Preview screen. "Enhance Poster" asks the server to design and draw a poster from the owner's
 * real photo; the selectors redraw it without any AI call; the box below takes a short instruction. The photo is never
 * changed, and the price comes only from the product record or what the owner types here.
 */
export function PosterStudio({ post, photoUrl, headline, callToAction, language, onPoster, onSaved }: PosterStudioProps) {
  const t = useT()
  const [templates, setTemplates] = useState<PosterTemplateOption[]>([])
  const [result, setResult] = useState<PosterResult | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [offer, setOffer] = useState('')
  const [price, setPrice] = useState('')
  const [instruction, setInstruction] = useState('')
  const [saved, setSaved] = useState(false)
  const applied = useRef({ offer: '', price: '' })

  useEffect(() => {
    getPosterOptions().then((o) => setTemplates(o.templates), () => undefined)
  }, [])

  const context = (): PosterContext => ({
    imageUrl: photoUrl,
    postId: post.id,
    productId: post.productId ?? undefined,
    price: price.trim() || undefined,
    offer: offer.trim() || undefined,
    headline: headline || undefined,
    callToAction: callToAction || undefined,
    language,
  })

  /** Runs one server step, shows its outcome, and keeps the latest poster in the preview. */
  const run = async (kind: Exclude<Busy, null>, step: () => Promise<PosterResult | null>) => {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      const next = await step()
      if (!next) return
      await preload(next.poster.url)
      setResult(next)
      setSaved(false)
      onPoster({ id: next.poster.id, url: next.poster.url })
      applied.current = { offer: offer.trim(), price: price.trim() }
      const messages = [...next.notes]
      if (next.source === 'ai' && next.reasoning) messages.unshift(next.reasoning)
      if (messages.length) setNotice(messages.join(' '))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const generate = () => run('generate', () => generatePoster(context()))
  const redraw = (changes: Partial<PosterDesign>) => {
    if (!result) return Promise.resolve()
    return run('render', () => renderPoster(context(), { ...result.design, ...changes }))
  }

  const choose = (tpl: PosterTemplateOption) => {
    if (!result || tpl.id === result.design.template) return
    // A new template brings its own palette; the owner's headline, call to action and price choices stay.
    void redraw({ template: tpl.id, ...tpl.defaults })
  }

  const applyInstruction = () => {
    const text = instruction.trim()
    if (!result || !text) return
    void run('edit', async () => {
      const out = await editPoster(context(), result.design, text)
      if (out.requiresClarification) {
        setNotice(out.clarificationQuestion)
        return null
      }
      setInstruction('')
      if (out.changesApplied.length) out.notes.unshift(translate('poster.studio.done', { changes: out.changesApplied.join('. ') }))
      return out
    })
  }

  const save = async () => {
    if (!result) return
    setBusy('save')
    setError(null)
    try {
      const out = await savePoster(result.poster.id, post.id)
      onSaved(out.post)
      setSaved(true)
      setNotice(t('poster.studio.savedNotice'))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  /** Offer and price are applied when the owner leaves the box, if they changed and a poster already exists. */
  const commitFacts = () => {
    if (!result) return
    if (applied.current.offer === offer.trim() && applied.current.price === price.trim()) return
    void run('render', async () => {
      // An offer poster needs its offer; if the owner cleared it, go back to a regular layout instead of failing.
      let design = result.design
      if (design.template === 'offer_poster' && !offer.trim()) {
        const fallback = templates.find((tpl) => tpl.id === 'minimal_studio')
        design = { ...design, template: 'minimal_studio', ...(fallback?.defaults ?? {}) }
      }
      return renderPoster(context(), design)
    })
  }

  const design = result?.design
  const locked = busy !== null
  const hasPrice = !!result?.price

  return (
    <Card className="poster-studio">
      <div className="row-between" style={{ marginBottom: 6 }}>
        <h2>{t('poster.studio.title')}</h2>
        {result ? <span className="badge badge-neutral">{result.source === 'ai' ? t('poster.studio.byAi') : result.source === 'template' ? t('poster.studio.standard') : t('poster.studio.yours')}</span> : null}
      </div>
      <p className="muted" style={{ fontSize: '0.9rem', marginBottom: 14 }}>
        {t('poster.studio.intro')}
      </p>

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}
      {notice ? (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="info">{notice}</Banner>
        </div>
      ) : null}

      <div className="poster-facts">
        <div className="field">
          <label htmlFor="poster-price">{t('poster.studio.price')}</label>
          <input id="poster-price" className="input" inputMode="decimal" placeholder={post.productId ? t('poster.studio.pricePlaceholderSaved') : t('poster.studio.pricePlaceholder')} value={price} disabled={locked} onChange={(e) => setPrice(e.target.value)} onBlur={commitFacts} />
          <span className="field-hint">{t('poster.studio.priceHint')}</span>
        </div>
        <div className="field">
          <label htmlFor="poster-offer">{t('poster.studio.offer')}</label>
          <input id="poster-offer" className="input" maxLength={40} placeholder={t('poster.studio.offerPlaceholder')} value={offer} disabled={locked} onChange={(e) => setOffer(e.target.value)} onBlur={commitFacts} />
          <span className="field-hint">{t('poster.studio.offerHint')}</span>
        </div>
      </div>

      {!result ? (
        <div className="actions" style={{ marginTop: 6 }}>
          <Button size="lg" icon="sparkle" loading={busy === 'generate'} disabled={locked} onClick={() => void generate()}>
            {t('poster.studio.enhance')}
          </Button>
        </div>
      ) : design ? (
        <>
          <div className="poster-group">
            <h3>{t('poster.studio.template')}</h3>
            <div className="chips" role="group" aria-label={t('poster.studio.template')}>
              {templates.map((tpl) => {
                const blocked = tpl.needsOffer && !offer.trim()
                return (
                  <button key={tpl.id} type="button" className="chip" aria-pressed={design.template === tpl.id} disabled={locked || blocked} title={blocked ? t('poster.studio.needOffer') : tpl.summary} onClick={() => choose(tpl)}>
                    {tpl.name}
                  </button>
                )
              })}
            </div>
          </div>

          {design.template !== 'cover_card' ? (
            <div className="poster-group">
              <h3>{t('poster.studio.background')}</h3>
              <div className="chips" role="group" aria-label={t('poster.studio.backgroundStyle')}>
                {BACKGROUNDS.map((b) => {
                  const on = design.backgroundStyle === b.apply.backgroundStyle && design.backgroundColor === b.apply.backgroundColor
                  return (
                    <button key={b.id} type="button" className="chip" aria-pressed={on} disabled={locked} onClick={() => void redraw(b.apply)}>
                      <span className="swatch" style={{ background: b.swatch }} aria-hidden /> {t(`poster.studio.bg.${b.id}`)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="poster-group">
            <h3>{t('poster.studio.font')}</h3>
            <div className="chips" role="group" aria-label={t('poster.studio.fontStyle')}>
              {FONTS.map((f) => (
                <button key={f.id} type="button" className="chip" style={{ fontFamily: f.css }} aria-pressed={(design.fontStyle ?? 'auto') === f.id} disabled={locked} onClick={() => void redraw({ fontStyle: f.id })}>
                  {t(`poster.studio.fonts.${f.id}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="poster-group">
            <h3>{t('poster.studio.photo')}</h3>
            <div className="chips" role="group" aria-label={t('poster.studio.photoEnhance')}>
              {TREATMENTS.map((tr) => (
                <button key={tr.id} type="button" className="chip" aria-pressed={design.photoTreatment === tr.id} disabled={locked} title={t(`poster.studio.treatments.${tr.id}.hint`)} onClick={() => void redraw({ photoTreatment: tr.id })}>
                  {t(`poster.studio.treatments.${tr.id}.label`)}
                </button>
              ))}
            </div>
          </div>

          <div className="poster-group">
            <h3>{t('poster.studio.badge')}</h3>
            {hasPrice ? (
              <div className="chips" role="group" aria-label={t('poster.studio.badge')}>
                <button type="button" className="chip" aria-pressed={design.showPrice} disabled={locked} onClick={() => void redraw({ showPrice: !design.showPrice })}>
                  {design.showPrice ? t('poster.studio.showing', { price: result?.price?.text ?? '' }) : t('poster.studio.show', { price: result?.price?.text ?? t('poster.studio.priceWord') })}
                </button>
                {(['bottom-right', 'bottom-left'] as PricePosition[]).map((p) => (
                  <button key={p} type="button" className="chip" aria-pressed={design.pricePosition === p} disabled={locked || !design.showPrice} onClick={() => void redraw({ pricePosition: p })}>
                    {p === 'bottom-right' ? t('poster.studio.bottomRight') : t('poster.studio.bottomLeft')}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: '0.88rem' }}>{t('poster.studio.noPrice')}</p>
            )}
          </div>

          <div className="field poster-edit">
            <label htmlFor="poster-instruction">{t('poster.studio.tellChange')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="poster-instruction"
                className="input"
                placeholder={t('poster.studio.example')}
                value={instruction}
                disabled={locked}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyInstruction()
                }}
              />
              <Button size="sm" loading={busy === 'edit'} disabled={locked || !instruction.trim()} onClick={applyInstruction}>
                {t('poster.studio.apply')}
              </Button>
            </div>
            <span className="field-hint">{t('poster.studio.editHint')}</span>
          </div>

          <div className="actions">
            <Button variant="secondary" icon="sparkle" loading={busy === 'generate'} disabled={locked} onClick={() => void generate()}>
              {t('poster.studio.regenerate')}
            </Button>
            <Button icon="check" loading={busy === 'save'} disabled={locked || saved} onClick={() => void save()}>
              {saved ? t('poster.studio.saved') : t('poster.studio.save')}
            </Button>
          </div>
          {busy === 'render' || busy === 'edit' ? <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>{t('poster.studio.redrawing')}</p> : null}
        </>
      ) : null}
    </Card>
  )
}
