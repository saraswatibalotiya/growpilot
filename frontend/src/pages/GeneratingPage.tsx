import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { RobotIllustration } from '../components/Illustrations'
import { Banner, Button, Card } from '../components/ui'
import type { GeneratedContent, Language, Post } from '../lib/types'
import { errorMessage } from '../lib/api'
import { generateContent } from '../services/ai'
import { getPost } from '../services/posts'
import { translate, useT } from '../i18n'
import { usePostFlow } from '../state/PostFlowContext'

const STEPS = ['understand', 'caption', 'poster']

export function GeneratingPage() {
  const t = useT()
  const navigate = useNavigate()
  const { draft, update } = usePostFlow()
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // One request per attempt, shared by every run of the effect. React runs effects twice in development,
  // and this keeps the AI step (and its cost) to a single call.
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  type Done = { content: GeneratedContent; language: Language; post: Post; warnings: string[] } | { clarification: string }
  const job = useRef<{ attempt: number; promise: Promise<Done> } | null>(null)

  useEffect(() => {
    const post = draft.post
    if (!post) return
    setError(null)
    setQuestion(null)
    setActive(0)
    if (job.current?.attempt !== attempt) {
      job.current = {
        attempt,
        promise: (async (): Promise<Done> => {
          if (!draft.conversationId) throw new Error(translate('post.generating.noConversation'))
          if (!draft.tone) throw new Error(translate('options.needTone'))
          const out = await generateContent({
            conversationId: draft.conversationId,
            postId: post.id,
            transcript: draft.transcript,
            language: draft.language,
            tone: draft.tone,
            captionLength: draft.captionLength,
            hashtagLevel: draft.hashtagLevel,
            productId: draft.productId ?? undefined,
            imageUrl: draft.photoUrl ?? undefined,
          })
          if ('clarification' in out) return out
          if (!out.content.caption?.trim() || !out.content.headline?.trim()) throw new Error(translate('post.generating.empty'))
          // The backend has already saved the draft; reload it so the screen shows what is stored.
          return { content: out.content, language: out.language, warnings: out.warnings, post: await getPost(post.id) }
        })(),
      }
    }
    const ticker = setInterval(() => setActive((a) => Math.min(a + 1, STEPS.length - 1)), 900)
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    job.current.promise.then(
      (result) => {
        if (cancelled) return
        clearInterval(ticker)
        if ('clarification' in result) {
          setQuestion(result.clarification)
          return
        }
        update({ content: result.content, post: result.post, language: result.language, aiNotes: result.warnings })
        setActive(STEPS.length)
        timer = setTimeout(() => navigate('/create/preview', { replace: true }), 450)
      },
      (e: unknown) => {
        if (cancelled) return
        clearInterval(ticker)
        setError(errorMessage(e))
      },
    )
    return () => {
      cancelled = true
      clearInterval(ticker)
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  if (!draft.post) return <Navigate to="/create" replace />

  return (
    <>
      <div className="page-head">
        <h1>{t('post.generating.title')}</h1>
      </div>
      <Card className="generate-card">
        <div>
          <ul className="gen-steps" aria-live="polite">
            {STEPS.map((step, i) => {
              const state = i < active ? 'done' : i === active && !error && !question ? 'active' : ''
              return (
                <li key={step} className={state}>
                  <span className="gen-dot">{state === 'done' ? <Icon name="check" size={16} /> : null}</span>
                  {t(`post.generating.steps.${step}`)}
                </li>
              )
            })}
          </ul>
          {question ? (
            <div style={{ marginTop: 22 }}>
              <Banner tone="info">{question}</Banner>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="answer" className="sr-only">{t('post.generating.answerLabel')}</label>
                <input id="answer" className="input" value={answer} placeholder={t('post.generating.answerPlaceholder')} onChange={(e) => setAnswer(e.target.value)} />
              </div>
              <div className="actions">
                <Button
                  disabled={!answer.trim()}
                  onClick={() => {
                    update({ transcript: `${draft.transcript} ${answer.trim()}`.trim() })
                    setAnswer('')
                    setAttempt((a) => a + 1)
                  }}
                >
                  {t('post.generating.continue')}
                </Button>
                <Button variant="ghost" onClick={() => navigate('/create')}>{t('post.generating.back')}</Button>
              </div>
            </div>
          ) : error ? (
            <div style={{ marginTop: 22 }}>
              <Banner tone="error">{error}</Banner>
              <div className="actions">
                <Button onClick={() => setAttempt((a) => a + 1)}>{t('post.generating.tryAgain')}</Button>
                <Button variant="ghost" onClick={() => navigate('/create')}>
                  {t('post.generating.back')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 24 }}>{t('post.generating.wait')}</p>
          )}
        </div>
        <RobotIllustration />
      </Card>
    </>
  )
}
