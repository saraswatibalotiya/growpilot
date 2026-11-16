import type { Language } from './types'

/**
 * Holds the sign-up details between the account step and the business step. It lives only in memory:
 * the password is never written to storage, and a page refresh sends the user back to the account step.
 */
interface Pending {
  name: string
  email: string
  password: string
}

let pending: Pending | null = null
let language: Language = 'en'

export const onboarding = {
  setAccount(value: Pending) {
    pending = value
  },
  account(): Pending | null {
    return pending
  },
  clear() {
    pending = null
  },
  setLanguage(value: Language) {
    language = value
  },
  language(): Language {
    return language
  },
}
