import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, setSignedOutHandler } from '../lib/api'
import { clearTokens, loadTokens } from '../lib/storage'
import type { BusinessProfile, InstagramAccount, SessionUser } from '../lib/types'
import * as authService from '../services/auth'
import * as businessService from '../services/business'
import { listInstagramAccounts } from '../services/instagram'

type Status = 'loading' | 'signedOut' | 'signedIn'
type InstagramState = { state: 'loading' } | { state: 'connected'; account: InstagramAccount } | { state: 'problem'; account: InstagramAccount } | { state: 'none' }

interface AuthContextValue {
  status: Status
  user: SessionUser | null
  business: BusinessProfile | null
  instagram: InstagramState
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { name: string; email: string; password: string; business: { name: string; category: string } }) => Promise<void>
  signOut: () => Promise<void>
  reloadBusiness: () => Promise<BusinessProfile | null>
  reloadInstagram: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const USER_KEY = 'growpilot.user'

function loadUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as SessionUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (loadTokens() ? 'loading' : 'signedOut'))
  const [user, setUser] = useState<SessionUser | null>(loadUser)
  const [business, setBusiness] = useState<BusinessProfile | null>(null)
  const [instagram, setInstagram] = useState<InstagramState>({ state: 'loading' })

  const reloadInstagram = useCallback(async () => {
    try {
      const profile = business ?? (await businessService.getProfile())
      const accounts = await listInstagramAccounts(profile.id)
      // A mock account is never shown as connected: only real, live connections count.
      const real = accounts.find((a) => !a.isMock)
      if (!real) setInstagram({ state: 'none' })
      else if (real.status === 'connected') setInstagram({ state: 'connected', account: real })
      else setInstagram({ state: 'problem', account: real })
    } catch {
      setInstagram({ state: 'none' })
    }
  }, [business])

  const reloadBusiness = useCallback(async () => {
    try {
      const profile = await businessService.getProfile()
      setBusiness(profile)
      return profile
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setBusiness(null)
      return null
    }
  }, [])

  useEffect(() => {
    setSignedOutHandler(() => {
      setStatus('signedOut')
      setUser(null)
      setBusiness(null)
    })
  }, [])

  useEffect(() => {
    if (status !== 'loading') return
    void (async () => {
      const profile = await reloadBusiness()
      setStatus(loadTokens() ? 'signedIn' : 'signedOut')
      if (profile) void listInstagramAccounts(profile.id).then(
        (accounts) => {
          const real = accounts.find((a) => !a.isMock)
          setInstagram(!real ? { state: 'none' } : real.status === 'connected' ? { state: 'connected', account: real } : { state: 'problem', account: real })
        },
        () => setInstagram({ state: 'none' }),
      )
    })()
  }, [status, reloadBusiness])

  const afterAuth = useCallback(
    async (sessionUser: SessionUser) => {
      localStorage.setItem(USER_KEY, JSON.stringify(sessionUser))
      setUser(sessionUser)
      const profile = await reloadBusiness()
      setStatus('signedIn')
      if (profile) {
        try {
          const accounts = await listInstagramAccounts(profile.id)
          const real = accounts.find((a) => !a.isMock)
          setInstagram(!real ? { state: 'none' } : real.status === 'connected' ? { state: 'connected', account: real } : { state: 'problem', account: real })
        } catch {
          setInstagram({ state: 'none' })
        }
      }
    },
    [reloadBusiness],
  )

  const signIn = useCallback(async (email: string, password: string) => afterAuth(await authService.login(email, password)), [afterAuth])
  const signUp = useCallback(async (input: Parameters<typeof authService.signup>[0]) => afterAuth(await authService.signup(input)), [afterAuth])

  const signOut = useCallback(async () => {
    await authService.logout(loadTokens()?.refreshToken ?? null)
    clearTokens()
    localStorage.removeItem(USER_KEY)
    setUser(null)
    setBusiness(null)
    setInstagram({ state: 'loading' })
    setStatus('signedOut')
  }, [])

  const value = useMemo(
    () => ({ status, user, business, instagram, signIn, signUp, signOut, reloadBusiness, reloadInstagram }),
    [status, user, business, instagram, signIn, signUp, signOut, reloadBusiness, reloadInstagram],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
