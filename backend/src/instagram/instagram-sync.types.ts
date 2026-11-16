import type { FieldOutputTypes } from '../../prisma/schema.d';

export interface PostWrite {
  mediaType: string | null;
  mediaProductType: string | null;
  caption: string | null;
  permalink: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  lastSeenAt: Date;
  deletedAt: Date | null;
}

export interface SnapshotWrite {
  instagramPostId: string;
  capturedAt: Date;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  profileVisits: number | null;
}

export type SyncKindName = 'profile' | 'media' | 'metrics';
export type SyncStatusName = 'queued' | 'running' | 'succeeded' | 'failed';

export interface SyncRunPatch {
  status?: SyncStatusName;
  finishedAt?: Date | null;
  itemsProcessed?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** A sync_runs row as returned to callers. */
export interface SyncRunRecord {
  id: string;
  socialAccountId: string;
  kind: SyncKindName;
  status: SyncStatusName;
  startedAt: Date;
  finishedAt: Date | null;
  itemsProcessed: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface PostIdRow {
  id: string;
}

export interface SyncAccountSummary {
  id: string;
  isMock: boolean;
  status: SocialAccountStatusName;
}

/** The full social_accounts row, including the encrypted token: for the sync worker only. Derived from the schema, so it cannot drift. */
export type SocialAccountRecord = FieldOutputTypes['public']['SocialAccount'];

export type SocialAccountStatusName = SocialAccountRecord['status'];
