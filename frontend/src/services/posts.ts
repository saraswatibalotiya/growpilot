import { request } from '../lib/api'
import type { Language, Page, Post, PostStatus } from '../lib/types'

export interface PostInput {
  imageUrls?: string[]
  originalImageUrl?: string
  productId?: string
  conversationId?: string
  caption?: string
  headline?: string
  callToAction?: string
  hashtags?: string[]
  language?: Language
  posterImageUrl?: string
}

export const listPosts = (page = 1, limit = 20, status?: PostStatus) =>
  request<Page<Post>>(`/posts?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`)
export const getPost = (id: string) => request<Post>(`/posts/${id}`)
export const createPost = (input: PostInput) => request<Post>('/posts', { method: 'POST', body: input })
export const deletePost = (id: string) => request<null>(`/posts/${id}`, { method: 'DELETE' })
export const updatePost = (id: string, changes: PostInput & { status?: 'USER_APPROVED' | 'PREVIEW_READY' }) =>
  request<Post>(`/posts/${id}`, { method: 'PATCH', body: changes })
