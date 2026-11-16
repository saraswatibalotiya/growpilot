import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LanguagePicker } from '../components/LanguagePicker'
import { ContentOptions } from '../components/ContentOptions'
import { ToneSelector } from '../components/ToneSelector'
import { useT } from '../i18n'
import { PhotoTips } from '../components/PhotoTips'
import { PhotoViewer } from '../components/PhotoViewer'
import { Banner, Button, Card, Field, MicButton, Waveform } from '../components/ui'
import { errorMessage } from '../lib/api'
import type { Product } from '../lib/types'
import { useSpeechRecognition } from '../hooks/useSpeech'
import { addUserMessage, startConversation } from '../services/conversations'
import { uploadPhoto } from '../services/media'
import { createPost } from '../services/posts'
import { listProducts } from '../services/products'
import { useAuth } from '../state/AuthContext'
import { usePostFlow } from '../state/PostFlowContext'

const MAX_PHOTOS = 10

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function CreatePage() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { business } = useAuth()
  const { draft, update, reset } = usePostFlow()

  const speech = useSpeechRecognition(draft.language)
  // `typed` is the committed text. While recording, the live words are shown straight from the speech hook.
  const [typed, setTyped] = useState(draft.transcript)
  const [source, setSource] = useState<'voice' | 'text'>(draft.inputSource)
  const [seconds, setSeconds] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [active, setActive] = useState(0)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  // Start from the business's preferred language, once.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !business?.preferredLanguage) return
    seeded.current = true
    if (draft.transcript === '' && draft.photoUrl === null) update({ language: business.preferredLanguage })
  }, [business, draft.transcript, draft.photoUrl, update])

  useEffect(() => {
    listProducts(1, 50).then(
      (page) => setProducts(page.items.filter((p) => p.isAvailable)),
      () => undefined,
    )
  }, [])

  // One-way flow: when a recording ends, its words become the committed text exactly once.
  const wasListening = useRef(false)
  useEffect(() => {
    if (wasListening.current && !speech.listening && speech.text.trim()) {
      setTyped(speech.text.trim())
      setSource('voice')
    }
    wasListening.current = speech.listening
  }, [speech.listening, speech.text])

  const shown = speech.listening ? speech.text : typed

  useEffect(() => {
    if (!speech.listening) return
    setSeconds(0)
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [speech.listening])

  /** Uploads one or more photos, in the order chosen, and appends them to the carousel (max 10). */
  const onPick = async (files: FileList | File[] | undefined | null) => {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    const room = MAX_PHOTOS - draft.photoUrls.length
    if (room <= 0) {
      setError(t('post.create.maxPhotos', { max: MAX_PHOTOS }))
      return
    }
    setUploading(true)
    setError(null)
    try {
      const uploaded: string[] = []
      for (const file of list.slice(0, room)) {
        const asset = await uploadPhoto(file)
        uploaded.push(asset.secureUrl)
      }
      const photoUrls = [...draft.photoUrls, ...uploaded]
      update({ photoUrls, photoUrl: photoUrls[0] ?? null, productId: null })
      if (uploaded.length > 0) setActive(draft.photoUrls.length)
      if (list.length > room) setError(t(room === 1 ? 'post.create.roomOne' : 'post.create.roomMany', { count: room }))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (index: number) => {
    const photoUrls = draft.photoUrls.filter((_, i) => i !== index)
    update({ photoUrls, photoUrl: photoUrls[0] ?? null })
    setActive((a) => Math.max(0, Math.min(a > index ? a - 1 : a, photoUrls.length - 1)))
  }

  /** Moves a photo to a new position in the carousel. Position 0 is the cover. */
  const movePhoto = (index: number, to: number) => {
    if (to < 0 || to >= draft.photoUrls.length) return
    const photoUrls = [...draft.photoUrls]
    const [moved] = photoUrls.splice(index, 1)
    photoUrls.splice(to, 0, moved)
    update({ photoUrls, photoUrl: photoUrls[0] ?? null })
    setActive(to)
  }

  const choose = (id: string) => {
    const product = products.find((p) => p.id === id)
    if (!product) return update({ productId: null })
    const photoUrls = product.imageUrl ? [product.imageUrl] : draft.photoUrls
    update({ productId: product.id, photoUrls, photoUrl: photoUrls[0] ?? null })
    if (!typed.trim()) setTyped(`${product.name}${product.price ? `, price ${product.price} rupees` : ''}`)
  }

  const ready = draft.photoUrls.length > 0 && shown.trim().length > 0 && draft.tone !== null && !speech.listening

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const transcript = typed.trim()
      const conversation = draft.conversationId ? { id: draft.conversationId } : await startConversation()
      await addUserMessage(conversation.id, transcript, draft.language, source)
      const post = await createPost({
        imageUrls: draft.photoUrls,
        productId: draft.productId ?? undefined,
        conversationId: conversation.id,
        language: draft.language,
      })
      update({ transcript, inputSource: source, conversationId: conversation.id, post, content: null, published: null, aiNotes: [] })
      navigate('/create/generating')
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const micClick = () => (speech.listening ? speech.stop() : speech.start())

  return (
    <>
      <div className="page-head">
        <Button variant="ghost" icon="back" onClick={() => navigate(-1)} aria-label={t('post.create.back')}>
          {t('post.create.back')}
        </Button>
        <h1 style={{ marginTop: 8 }}>{t('post.create.title')}</h1>
        <p>{t('post.create.subtitle')}</p>
      </div>

      {error ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <div className="create-grid">
        <Card className="style-card">
          <h2 style={{ marginBottom: 12 }}>{t('tones.title')}</h2>
          <div className="style-body">
            <ToneSelector value={draft.tone} onChange={(tone) => update({ tone })} />
            <ContentOptions
              captionLength={draft.captionLength}
              hashtagLevel={draft.hashtagLevel}
              onCaptionLength={(captionLength) => update({ captionLength })}
              onHashtagLevel={(hashtagLevel) => update({ hashtagLevel })}
            />
          </div>
        </Card>

        <Card className="voice-card">
          <div className="row-between" style={{ marginBottom: 6 }}>
            <h2>{t('post.create.voice')}</h2>
            <span className="badge badge-neutral">{speech.supported ? t('post.create.voiceReady') : t('post.create.voiceUnavailable')}</span>
          </div>
          <div className="mic-stage" style={{ padding: '18px 0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
              <Waveform live={speech.listening} />
              <MicButton recording={speech.listening} onClick={micClick} disabled={!speech.supported} />
              <Waveform live={speech.listening} />
            </div>
          </div>
          <div className="state-label">{speech.listening ? t('post.create.recording') : speech.supported ? t('post.create.tapToSpeak') : t('post.create.typeBelow')}</div>
          {speech.listening ? <div className="timer">{clock(seconds)}</div> : null}
          {params.get('mic') && !speech.listening && !typed ? <p className="example">{t('post.create.micHint')}</p> : null}
          {speech.error ? (
            <div style={{ marginTop: 14, textAlign: 'left' }}>
              <Banner tone="warning">{speech.error}</Banner>
            </div>
          ) : null}
          <div className="field transcript">
            <label htmlFor="transcript">{t('post.create.said')}</label>
            <textarea
              id="transcript"
              className="textarea"
              placeholder={t('post.create.example')}
              value={shown}
              readOnly={speech.listening}
              onChange={(e) => {
                setTyped(e.target.value)
                setSource('text')
              }}
            />
            <span className="field-hint">{t('post.create.editHint')}</span>
          </div>
          <div className="field" style={{ textAlign: 'left' }}>
            <label>{t('post.create.language')}</label>
            <LanguagePicker value={draft.language} onChange={(language) => update({ language })} />
          </div>
        </Card>
        <Card>
          <h2 style={{ marginBottom: 14 }}>{t('post.create.photoTitle')}</h2>
          <div className={`dropzone ${draft.photoUrl ? 'has-image' : ''}`}>
            {draft.photoUrls.length > 0 ? (
              <PhotoViewer urls={draft.photoUrls} index={Math.min(active, draft.photoUrls.length - 1)} onIndex={setActive} />
            ) : (
              <div className="empty" style={{ padding: 0 }}>
                <div className="empty-icon">
                  <Icon name="camera" size={28} />
                </div>
                <h3>{t('post.create.addPhoto')}</h3>
                <p>{t('post.create.formats')}</p>
              </div>
            )}
          </div>
          <div className="upload-actions">
            <Button variant="secondary" icon="camera" loading={uploading} onClick={() => cameraInput.current?.click()}>
              {t('post.create.camera')}
            </Button>
            <Button variant="secondary" icon="upload" loading={uploading} onClick={() => galleryInput.current?.click()}>
              {t('post.create.upload')}
            </Button>
          </div>
          {draft.photoUrls.length > 0 ? (
            <div className="photo-strip" aria-label={t('post.create.strip')}>
              {draft.photoUrls.map((url, i) => (
                <div className={`photo-thumb ${i === active ? 'active' : ''}`} key={`${i}-${url}`}>
                  <img src={url} alt={i === 0 ? t('photo.viewer.cover') : t('photo.viewer.photoN', { n: i + 1 })} onClick={() => setActive(i)} />
                  {i === 0 ? <span className="photo-cover">{t('post.create.cover')}</span> : null}
                  <div className="photo-tools">
                    <button type="button" aria-label={t('post.create.earlier', { n: i + 1 })} disabled={i === 0} onClick={() => movePhoto(i, i - 1)}>←</button>
                    <button type="button" aria-label={t('post.create.later', { n: i + 1 })} disabled={i === draft.photoUrls.length - 1} onClick={() => movePhoto(i, i + 1)}>→</button>
                    <button type="button" aria-label={t('post.create.remove', { n: i + 1 })} onClick={() => removePhoto(i)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <PhotoTips />
          <p className="field-hint" style={{ marginTop: 8 }}>{t('post.create.photoCount', { count: draft.photoUrls.length, max: MAX_PHOTOS })}</p>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPick(e.target.files)} />
          <input ref={galleryInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => void onPick(e.target.files)} />

          {products.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <Field label={t('post.create.pickProduct')} htmlFor="product">
                <select id="product" className="select" value={draft.productId ?? ''} onChange={(e) => choose(e.target.value)}>
                  <option value="">{t('post.create.chooseProduct')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.price ? ` — ₹${p.price}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
        <Button
          variant="ghost"
          onClick={() => {
            reset(draft.language)
            setTyped('')
            setSource('voice')
            speech.reset()
          }}
        >
          {t('post.create.startOver')}
        </Button>
        <Button size="lg" icon="sparkle" disabled={!ready} loading={busy} onClick={() => void submit()}>
          {t('post.create.submit')}
        </Button>
      </div>
      {!ready && !busy ? <p className="muted" style={{ textAlign: 'right', marginTop: 8, fontSize: '0.85rem' }}>{draft.photoUrls.length === 0 ? t('post.create.needPhoto') : shown.trim().length === 0 ? t('post.create.needWords') : t('options.needTone')}</p> : null}
    </>
  )
}
