import { request } from '../lib/api'
import type { Conversation, Language } from '../lib/types'

export const startConversation = () => request<Conversation>('/conversations', { method: 'POST' })

export const addUserMessage = (conversationId: string, content: string, language: Language, source: 'voice' | 'text') =>
  request<{ id: string }>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { content, language, metadata: { source } },
  })
