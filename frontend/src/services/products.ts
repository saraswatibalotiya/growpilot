import { request } from '../lib/api'
import type { Page, Product } from '../lib/types'

export interface ProductInput {
  name: string
  description?: string
  category?: string
  price?: string
  imageUrl?: string
  isAvailable?: boolean
}

export const listProducts = (page = 1, limit = 20) => request<Page<Product>>(`/products?page=${page}&limit=${limit}`)
export const createProduct = (input: ProductInput) => request<Product>('/products', { method: 'POST', body: input })
export const updateProduct = (id: string, input: Partial<ProductInput>) =>
  request<Product>(`/products/${id}`, { method: 'PATCH', body: input })
export const deleteProduct = (id: string) => request<null>(`/products/${id}`, { method: 'DELETE' })
