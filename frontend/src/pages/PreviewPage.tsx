import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LanguagePicker } from '../components/LanguagePicker'
import { PosterPreview } from '../components/PosterPreview'
import { PosterStudio } from '../components/PosterStudio'
import { Banner, Button, MicButton, Spinner, languageName } from '../components/ui'
import { errorMessage } from '../lib/api'
import type { GeneratedContent, Language } from '../lib/types'
import { useSpeechRecognition, useSpeechSynthesis } from '../hooks/useSpeech'
import { editContent } from '../services/ai'
import { startConversation } from '../services/conversations'
import { getPost, updatePost } from '../services/posts'
import { useT } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { usePostFlow } from '../state/PostFlowContext'

type Tab = 'caption' | 'hashtags' | 'language'

export function PreviewPage() {
  const t = useT()
  const navigate = useNavigate()
  const { business } = useAuth()
  const { draft, update } = usePostFlow()
  const [tab, setTab] = useState<Tab>('caption')
  const [changing, setChanging] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  // The poster currently drawn for this post (not necessarily saved yet).
  const [livePoster, setLivePoster] = useState<{ id: string; url: string } | null>(null)
  // The language the owner just tapped. Shown at once, while the AI rewrites the text.
  const [switchingTo, setSwitchingTo] = useState<Language | null>(null)

  const speech = useSpeechRecognition(draft.language)
  const voice = useSpeechSynthesis()

  if (!draft.post || !draft.content) return <Navigate to="/create" replace />
  const content = draft.content
  const shop = business?.name ?? t('post.shopFallback')

  const setContent = (changes: Partial<GeneratedContent>) => update({ content: { ...content, ...changes } })

  const applyChange = async (text: string) => {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      // Older drafts may have no conversation yet; the AI needs one to keep the edit history.
      let conversationId = draft.conversationId
      if (!conversationId) {
        conversationId = (await startConversation()).id
        update({ conversationId })
      }
      const result = await editContent(conversationId, draft.post!.id, text, content)
      if ('clarification' in result) {
        setNotice(result.clarification)
      } else {
        // The backend saved the edit into this same draft. Reload it so the stored post and the screen agree.
        update({ content: result.content, language: result.language, post: await getPost(draft.post!.id) })
        setNotice(result.notes.length ? t('post.preview.doneNotes', { notes: result.notes.join('. ') }) : t('post.preview.done'))
      }
      setInstruction('')
      speech.reset()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      setSwitchingTo(null)
    }
  }

  const looksGood = async () => {
    setSaving(true)
    setError(null)
    try {
      const post = await updatePost(draft.post!.id, {
        headline: content.headline,
        caption: content.caption,
        callToAction: content.callToAction,
        hashtags: content.hashtags,
        language: draft.language,
      })
      update({ post })
      navigate('/create/publish')
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  const chooseLanguage = (language: Language) => {
    if (busy || language === draft.language) return
    setSwitchingTo(language)
    void applyChange(`Translate everything into ${{ hi: 'Hindi', mr: 'Marathi', en: 'English' }[language]}`)
  }

  return (
    <>
      <div className="page-head">
        <Button variant="ghost" icon="back" onClick={() => navigate('/create')}>
          {t('post.preview.back')}
        </Button>
        <h1 style={{ marginTop: 8 }}>{t('post.preview.title')}</h1>
        <p>{t('post.preview.subtitle')}</p>
      </div>

      {draft.aiNotes.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="warning">{draft.aiNotes.join(' ')}</Banner>
        </div>
      ) : null}

      {content.source === 'demo' ? (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info">
            <strong>{t('post.preview.demoTitle')}</strong> {t('post.preview.demoBody')}
          </Banner>
        </div>
      ) : null}

      <div className="preview-grid">
        <PosterPreview shopName={shop} photoUrl={draft.photoUrl} photoUrls={draft.photoUrls} posterUrl={livePoster?.url ?? draft.post.posterImageUrl} content={content} />
        <div>
          <div className="tabs" role="tablist">
            {(['caption', 'hashtags', 'language'] as Tab[]).map((id) => (
              <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {t(`post.preview.tabs.${id}`)}
              </button>
            ))}
          </div>

          {tab === 'caption' ? (
            <div className="field">
              <label htmlFor="caption" className="sr-only">
                {t('post.preview.tabs.caption')}
              </label>
              <textarea id="caption" className="textarea" value={content.caption} onChange={(e) => setContent({ caption: e.target.value })} />
              <span className="field-hint">{t('post.preview.characters', { count: content.caption.length })}</span>
            </div>
          ) : null}
          {tab === 'hashtags' ? (
            <div className="field">
              <div className="hashtags">
                {content.hashtags.map((h) => (
                  <span key={h} className="tag">
                    {h}
                  </span>
                ))}
              </div>
              <span className="field-hint" style={{ marginTop: 10 }}>{t('post.preview.hashtagHint')}</span>
            </div>
          ) : null}
          {tab === 'language' ? (
            <div className="field">
              <label>{t('post.preview.postLanguage')}</label>
              <LanguagePicker value={switchingTo ?? draft.language} onChange={chooseLanguage} disabled={busy} />
              {busy && switchingTo ? <span className="field-hint" role="status"><Spinner /> {t('post.preview.rewriting', { language: languageName(switchingTo) })}</span> : null}
              <span className="field-hint">{t('post.preview.switchHint')}</span>
            </div>
          ) : null}

          <Button variant="secondary" icon="volume" onClick={() => (voice.speaking ? voice.cancel() : voice.speak(`${content.headline}. ${content.caption}`, draft.language))} disabled={!voice.supported}>
            {voice.speaking ? t('post.preview.stop') : t('post.preview.listen')}
          </Button>

          {notice ? (
            <div style={{ marginTop: 14 }}>
              <Banner tone="info">{notice}</Banner>
            </div>
          ) : null}
          {error ? (
            <div style={{ marginTop: 14 }}>
              <Banner tone="error">{error}</Banner>
            </div>
          ) : null}

          {changing ? (
            <div className="voice-edit" aria-live="polite">
              <MicButton small recording={speech.listening} disabled={!speech.supported} onClick={() => (speech.listening ? speech.stop() : speech.start())} />
              <div style={{ flex: 1 }}>
                <p>{speech.listening ? t('post.preview.listening') : t('post.preview.tellChange')}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    className="input"
                    aria-label={t('post.preview.whatToChange')}
                    placeholder={t('post.preview.example')}
                    value={speech.text || instruction}
                    onChange={(e) => {
                      setInstruction(e.target.value)
                      speech.setText(e.target.value)
                    }}
                  />
                  <Button size="sm" loading={busy} disabled={!(speech.text || instruction).trim() || speech.listening} onClick={() => void applyChange(speech.text || instruction)}>
                    {t('post.preview.apply')}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="actions">
            <Button size="lg" icon="check" loading={saving} onClick={() => void looksGood()}>
              {t('post.preview.looksGood')}
            </Button>
            <Button size="lg" variant="secondary" icon="edit" onClick={() => setChanging((c) => !c)}>
              {t('post.preview.change')}
            </Button>
          </div>
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: 12 }}>
            <Icon name="info" size={14} /> {t('post.preview.nothingPosted')}
          </p>
        </div>
      </div>

      {draft.photoUrl ? (
        <div style={{ marginTop: 24 }}>
          <PosterStudio
            post={draft.post}
            photoUrl={draft.photoUrl}
            headline={content.headline}
            callToAction={content.callToAction}
            language={draft.language}
            onPoster={setLivePoster}
            onSaved={(post) => update({ post })}
          />
        </div>
      ) : null}
    </>
  )
}
