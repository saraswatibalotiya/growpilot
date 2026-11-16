import { clearTokens, loadTokens, saveTokens } from './storage'
import { translate } from '../i18n'
import type { AuthTokens } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Raised when a feature the backend has not shipped yet is used. The UI shows an honest message for it. */
export class NotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotAvailableError'
  }
}

let onSignedOut: (() => void) | null = null
export function setSignedOutHandler(handler: () => void): void {
  onSignedOut = handler
}

let refreshing: Promise<boolean> | null = null

/** One refresh at a time: parallel 401s share the same request, so the rotating token is used once. */
async function refreshTokens(): Promise<boolean> {
  const tokens = loadTokens()
  if (!tokens) return false
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      })
      if (!res.ok) return false
      saveTokens((await res.json()) as AuthTokens)
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message
    if (Array.isArray(m)) return m.join('. ')
    if (typeof m === 'string') return m
  }
  return fallback
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  form?: FormData
  auth?: boolean
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, auth = true, signal } = options

  const send = () => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    const tokens = loadTokens()
    if (auth && tokens) headers['authorization'] = `Bearer ${tokens.accessToken}`
    return fetch(`${BASE}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    })
  }

  let res: Response
  try {
    res = await send()
  } catch {
    throw new ApiError(0, translate('errors.network'))
  }

  if (res.status === 401 && auth && (await refreshTokens())) {
    res = await send()
  }
  if (res.status === 401 && auth) {
    clearTokens()
    onSignedOut?.()
    throw new ApiError(401, translate('errors.sessionExpired'))
  }

  const text = await res.text()
  const data: unknown = text ? safeJson(text) : null
  if (!res.ok) {
    if (res.status === 429) throw new ApiError(429, translate('errors.tooMany'))
    throw new ApiError(res.status, messageFrom(data, translate('errors.statusFailed', { status: res.status })))
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : translate('errors.generic')
}
