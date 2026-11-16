import { request } from '../lib/api'
import type { InstagramAccount } from '../lib/types'

export const listInstagramAccounts = (businessId: string) =>
  request<InstagramAccount[]>(`/integrations/instagram/accounts?businessId=${encodeURIComponent(businessId)}`)

/** Returns the Meta login URL. The browser is sent there; tokens are handled by the backend only. */
export const startInstagramConnect = (businessId: string) =>
  request<{ authorizationUrl: string }>(`/integrations/instagram/connect?businessId=${encodeURIComponent(businessId)}`)

export interface SyncRun {
  id: string
  kind: 'profile' | 'media' | 'metrics'
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  itemsProcessed: number
  errorCode: string | null
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}

/** Starts a media sync from Instagram (the server reads, never publishes). Returns the run, or the one already running. */
export const startMediaSync = (accountId: string) =>
  request<{ alreadyInProgress: boolean; run: SyncRun }>(`/integrations/instagram/accounts/${accountId}/sync-media`, { method: 'POST' })

export const listSyncRuns = (accountId: string) => request<SyncRun[]>(`/integrations/instagram/accounts/${accountId}/sync-runs`)
