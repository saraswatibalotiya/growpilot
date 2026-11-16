import type { AuthTokens } from './types'

const KEY = 'growpilot.session'

/**
 * Tokens are kept in localStorage so a refresh keeps you signed in. The access token lasts 15 minutes and the
 * refresh token rotates on every use. Move to httpOnly cookies if the backend adds them.
 */
export function loadTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AuthTokens) : null
  } catch {
    return null
  }
}

export function saveTokens(tokens: AuthTokens): void {
  localStorage.setItem(KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem(KEY)
}
