export type InstagramMode = 'mock' | 'live';
/**
 * instagram_login: classic Instagram Login (instagram.com OAuth, per-user token).
 * facebook_login:  Meta "unified login" configuration (facebook.com dialog with config_id, per-user token).
 * Selected by INSTAGRAM_LOGIN_CONFIG_ID: set -> facebook_login.
 */
export type LoginFlow = 'instagram_login' | 'facebook_login';

export interface ShortLivedToken {
  accessToken: string;
  userId: string;
  permissions: string[];
}
export interface LongLivedToken {
  accessToken: string;
  expiresInSeconds: number;
}
export interface InstagramBusinessAccount {
  id: string;
  username: string | null;
}
export interface InstagramProfile {
  id: string;
  username: string;
  name: string | null;
  accountType: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
}
export interface InstagramMediaItem {
  id: string;
  caption: string | null;
  mediaType: string | null;
  mediaProductType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentsCount: number | null;
}
export interface InstagramMediaPage {
  items: InstagramMediaItem[];
  nextCursor: string | null;
}
export interface InstagramInsightMetric {
  name: string;
  title: string | null;
  value: number | null;
}

/** A parsed Graph API JSON object. The shape varies by endpoint, so values are narrowed where they are read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GraphJson = Record<string, any>;
