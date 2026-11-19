import type { BusinessFacts, PostFacts } from './ai-engine.types';

const GOALS: Record<string, string> = {
  sales: 'SALES',
  sell: 'SALES',
  leads: 'LEADS',
  reach: 'REACH',
  awareness: 'BRAND_AWARENESS',
  engagement: 'ENGAGEMENT',
  community: 'COMMUNITY_BUILDING',
  saves: 'SAVES',
  shares: 'SHARES',
};

/** Words the engine's industry matching understands. `other` carries no category rather than a made-up one. */
const CATEGORY_WORDS: Record<string, string | null> = {
  clothing: 'clothing',
  jewellery: 'jewellery',
  grocery: 'grocery store',
  footwear: 'footwear store',
  other: null,
};

/** The engine's id for a business. Derived, not stored: it needs no mapping table and cannot name another owner's profile. */
export function engineProfileId(businessId: string): string {
  return `biz_${businessId}`;
}

export function toEngineProfile(business: BusinessFacts, instagramUsername: string | null, productNames: string[]) {
  const goal = business.primaryGoal ? Object.entries(GOALS).find(([word]) => business.primaryGoal!.toLowerCase().includes(word))?.[1] : undefined;
  const cut = (value: string | null, max: number) => (value ? value.slice(0, max) : null);
  return {
    profile_type: 'BUSINESS',
    name: business.name.slice(0, 120),
    instagram_username: instagramUsername && /^[A-Za-z0-9._]{1,30}$/.test(instagramUsername) ? instagramUsername : null,
    category: CATEGORY_WORDS[business.category] ?? null,
    description: cut(business.description, 1000),
    target_audience: cut(business.targetAudience, 500),
    country: 'India',
    city: cut(business.city, 200),
    region: cut(business.area, 200),
    primary_language: business.preferredLanguage ?? 'en',
    goals: goal ? [goal] : [],
    products: productNames.map((n) => n.trim().slice(0, 120)).filter(Boolean).slice(0, 40),
  };
}

/** Metrics that are null stay null: the engine treats null as "not available", never as zero. */
export function toEnginePosts(posts: PostFacts[]) {
  return posts.map((p) => ({
    media_id: p.platformMediaId.slice(0, 64),
    caption: p.caption ? p.caption.slice(0, 2200) : null,
    media_type: p.mediaType,
    media_product_type: p.mediaProductType,
    posted_at: p.publishedAt.toISOString(),
    permalink: p.permalink ? p.permalink.slice(0, 500) : null,
    views: p.metrics?.views ?? null,
    reach: p.metrics?.reach ?? null,
    likes: p.metrics?.likes ?? null,
    comments: p.metrics?.comments ?? null,
    shares: p.metrics?.shares ?? null,
    saves: p.metrics?.saves ?? null,
    follower_count: p.followerCount,
  }));
}
