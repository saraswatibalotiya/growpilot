// DEVELOPMENT ONLY. Loaded only when import.meta.env.DEV, so it is not part of the production build.
// It lets a developer (or a screenshot script) open any screen with a session and a sample draft.
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { saveTokens } from '../lib/storage'
import type { GeneratedContent, Post } from '../lib/types'
import { usePostFlow } from '../state/PostFlowContext'

const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3e6"/><stop offset="1" stop-color="#ffd9ec"/></linearGradient></defs><rect width="400" height="500" fill="url(#b)"/><rect x="120" y="40" width="160" height="12" rx="6" fill="#8d6e63"/><path d="M200 52l-26 24h52z" fill="#8d6e63"/><path d="M150 96c20 18 80 18 100 0l46 40-26 62-24-12 8 250H146l8-250-24 12-26-62z" fill="#e8438e"/><path d="M168 130c18 14 46 14 64 0" stroke="#fff" stroke-width="5" fill="none" opacity=".7"/><g fill="#ffd166"><circle cx="200" cy="170" r="5"/><circle cx="200" cy="205" r="5"/><circle cx="200" cy="240" r="5"/></g><g fill="#fff" opacity=".55"><circle cx="170" cy="320" r="7"/><circle cx="230" cy="340" r="7"/><circle cx="195" cy="380" r="7"/><circle cx="165" cy="420" r="7"/><circle cx="235" cy="430" r="7"/></g></svg>`,
  )

const CONTENT: GeneratedContent = {
  headline: 'New Cotton Kurti Collection',
  caption: 'New cotton kurtis are here! Elegant, comfortable and perfect for every occasion. ❤️',
  callToAction: 'DM now',
  hashtags: ['#Kurti', '#Fashion', '#EthnicWear', '#Boutique', '#Style'],
  productName: 'Cotton kurti',
  price: '899',
  source: 'demo',
}

const POST: Post = {
  id: '00000000-0000-4000-8000-000000000001',
  businessId: '00000000-0000-4000-8000-000000000002',
  conversationId: null,
  productId: null,
  originalImageUrl: PHOTO,
  posterImageUrl: null,
  caption: CONTENT.caption,
  headline: CONTENT.headline,
  callToAction: CONTENT.callToAction,
  hashtags: CONTENT.hashtags,
  language: 'en',
  status: 'PREVIEW_READY',
  instagramMediaId: null,
  publishedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

/** /dev/session?access=...&refresh=...&name=...&email=...&to=/ */
export function DevSession() {
  const [params] = useSearchParams()
  useEffect(() => {
    saveTokens({ accessToken: params.get('access') ?? '', refreshToken: params.get('refresh') ?? '', expiresIn: 900, refreshExpiresIn: 86400 })
    localStorage.setItem('growpilot.user', JSON.stringify({ id: 'dev', name: params.get('name') ?? 'Dev', email: params.get('email') ?? 'dev@example.test' }))
    window.location.replace(params.get('to') ?? '/')
  }, [params])
  return null
}

/** /dev/seed?screen=generating|preview|publish|done, with a sample draft. */
export function DevSeed() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { update } = usePostFlow()
  useEffect(() => {
    const screen = params.get('screen') ?? 'preview'
    update({
      photoUrls: [PHOTO, PHOTO.replace('e8438e', '2f80ed').replace(/ffd9ec/g, 'dbeafe'), PHOTO.replace('e8438e', '27ae60').replace(/ffd9ec/g, 'dcfce7')],
      photoUrl: PHOTO,
      transcript: 'New cotton kurtis aaye hain. Price 899 rupees. Ek attractive Instagram post banao.',
      language: 'en',
      post: POST,
      content: screen === 'generating' ? null : CONTENT,
      published: screen === 'done' ? { ...POST, status: 'PUBLISHED' } : null,
    })
    navigate(screen === 'generating' ? '/create' : `/create/${screen}`, { replace: true })
  }, [params, update, navigate])
  return null
}
