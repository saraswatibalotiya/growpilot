import { request } from '../lib/api'
import { clearTokens, saveTokens } from '../lib/storage'
import type { AuthTokens, SessionUser } from '../lib/types'

interface AuthResponse extends AuthTokens {
  user: SessionUser
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false })
  saveTokens(res)
  return res.user
}

export async function signup(input: {
  name: string
  email: string
  password: string
  business: { name: string; category: string }
}): Promise<SessionUser> {
  const res = await request<AuthResponse>('/auth/signup', { method: 'POST', body: input, auth: false })
  saveTokens(res)
  return res.user
}

export async function logout(refreshToken: string | null): Promise<void> {
  try {
    if (refreshToken) await request('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false })
  } finally {
    clearTokens()
  }
}
