import { request } from '../lib/api'
import type { MediaAsset } from '../lib/types'

/** Uploads a photo and, by default, replaces it with the approved Quick Enhance version. Any failure keeps the original. */
export async function uploadPhoto(file: File): Promise<MediaAsset> {
  const form = new FormData()
  form.append('file', file)
  const original = await request<MediaAsset>('/media/upload', { method: 'POST', form })
  try {
    const { result } = await enhancePhoto(original.id, 'quick')
    const approved = await approvePhoto(result.id)
    return {
      ...original,
      id: approved.id,
      secureUrl: approved.url,
      mimeType: 'image/jpeg',
      width: approved.width,
      height: approved.height,
      bytes: approved.bytes,
    }
  } catch {
    return original
  }
}

export interface StudioAsset {
  id: string
  url: string
  variant: 'original' | 'enhanced' | 'ai_edited'
  width: number | null
  height: number | null
  bytes: number
  approved: boolean
}

export interface EditResult {
  original: StudioAsset
  result: StudioAsset
  warnings: string[]
}

export const enhancePhoto = (mediaId: string, mode: 'quick') =>
  request<EditResult>('/media/enhance', { method: 'POST', body: { mediaId, mode, format: 'portrait' } })

export const approvePhoto = (mediaId: string) => request<StudioAsset>(`/media/${mediaId}/approve`, { method: 'POST' })
