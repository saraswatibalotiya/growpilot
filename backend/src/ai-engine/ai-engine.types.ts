/** The business facts the engine needs. Read from our own tables; nothing here is client-supplied. */
export interface BusinessFacts {
  id: string;
  name: string;
  category: string;
  description: string | null;
  city: string | null;
  area: string | null;
  targetAudience: string | null;
  preferredLanguage: string | null;
  primaryGoal: string | null;
}

export interface AccountFacts {
  id: string;
  username: string | null;
  isMock: boolean;
  status: string;
}

export interface PostFacts {
  platformMediaId: string;
  mediaType: string | null;
  mediaProductType: string | null;
  caption: string | null;
  permalink: string | null;
  publishedAt: Date;
  /** Latest metric snapshot. null = Instagram did not report it (never read as zero). */
  metrics: {
    views: number | null;
    reach: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    shares: number | null;
  } | null;
  followerCount: number | null;
}

export interface EngineSourceData {
  business: BusinessFacts;
  account: AccountFacts | null;
  posts: PostFacts[];
  productNames: string[];
}

/** What the caller learns about the data the engine was given. */
export interface DataContext {
  instagramConnected: boolean;
  /** True when the connected account is a mock one: recommendations then rest on demo data. */
  mockAccount: boolean;
  postsSent: number;
}
