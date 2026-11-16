import { request } from '../lib/api'
import type { BusinessProfile, Language } from '../lib/types'

export type ProfileUpdate = Partial<{
  name: string
  category: string
  preferredLanguage: Language
  supportedLanguages: Language[]
  description: string
  city: string
  area: string
  targetAudience: string
}>

export const getProfile = () => request<BusinessProfile>('/business/profile')
export const updateProfile = (changes: ProfileUpdate) =>
  request<BusinessProfile>('/business/profile', { method: 'PATCH', body: changes })
