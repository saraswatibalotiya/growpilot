import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import { v5 as uuidv5 } from 'uuid';
import { db } from './db';
import testCases from './test-cases.json';

type SeedTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TestCase = (typeof testCases)[number];
type SeedMetrics = {
  reach?: number | null;
  averageReach?: number;
  likes?: number | null;
  comments?: number | null;
  views?: number | null;
  averageLikes?: number;
  averageComments?: number;
  profileVisits?: number;
  clicks?: number | null;
  enquiries?: number;
  orders?: number;
  revenue?: number;
};

/** Fixture categories mapped onto the BusinessCategory enum. */
const CATEGORY_MAP: Record<
  string,
  'clothing' | 'jewellery' | 'grocery' | 'footwear' | 'other'
> = {
  fashion: 'clothing',
  food: 'grocery',
  cafe: 'grocery',
};

function toCategory(category: string) {
  return CATEGORY_MAP[category] ?? 'other';
}

function fixtureId(caseId: string, entity: string) {
  return uuidv5(`growpilot:qa:${caseId}:${entity}`, uuidv5.URL);
}

const ownerId = fixtureId('owner', 'user');

const asMetric = (value?: number | null) =>
  typeof value === 'number' ? value : null;
const scaled = (value: number | null, factor: number) =>
  value === null ? null : Math.round(value * factor);

/**
 * Mock posts with two metric snapshots each (an early one and a later one, so growth is visible).
 * Metrics the fixture does not know stay null; TC009 has no metrics at all. Fixed ids make re-seeding
 * idempotent. These belong to mock accounts, which the live-only sync refuses to touch.
 */
async function seedPosts(
  transaction: SeedTransaction,
  caseId: string,
  socialAccountId: string,
  postCount: number | null | undefined,
  metrics: SeedMetrics,
) {
  const count = Math.min(postCount ?? 0, 6);
  const unavailable = caseId.includes('METRICS_UNAVAILABLE');
  const base = {
    likes: unavailable ? null : asMetric(metrics.averageLikes ?? metrics.likes),
    comments: unavailable
      ? null
      : asMetric(metrics.averageComments ?? metrics.comments),
    reach: unavailable ? null : asMetric(metrics.averageReach ?? metrics.reach),
    views: unavailable ? null : asMetric(metrics.views),
    profileVisits: unavailable ? null : asMetric(metrics.profileVisits),
  };

  for (let i = 1; i <= count; i += 1) {
    const postId = fixtureId(caseId, `post-${i}`);
    const postData = {
      socialAccountId,
      platformMediaId: `mock:${caseId}:post-${i}`,
      mediaType: i % 3 === 0 ? 'VIDEO' : 'IMAGE',
      mediaProductType: i % 3 === 0 ? 'REELS' : 'FEED',
      caption: `QA mock post ${i} for ${caseId}`,
      permalink: `https://www.instagram.com/p/mock-${caseId.toLowerCase()}-${i}/`,
      publishedAt: new Date(Date.UTC(2026, 9, 31 - i * 3, 12)),
      lastSeenAt: new Date(Date.UTC(2026, 10, 14, 6)),
    };
    await transaction.orm.public.InstagramPost.upsert({
      create: { id: postId, ...postData },
      update: postData,
    });

    for (const [name, factor, capturedAt] of [
      ['early', 0.6, new Date(Date.UTC(2026, 10, 7, 6))],
      ['latest', 1, new Date(Date.UTC(2026, 10, 14, 6))],
    ] as const) {
      const snapshot = {
        instagramPostId: postId,
        capturedAt,
        likes: scaled(base.likes, factor),
        comments: scaled(base.comments, factor),
        reach: scaled(base.reach, factor),
        views: scaled(base.views, factor),
        profileVisits: scaled(base.profileVisits, factor),
        // Not provided by any fixture: unknown, not zero.
        saves: null,
        shares: null,
      };
      await transaction.orm.public.PostMetricSnapshot.upsert({
        create: {
          id: fixtureId(caseId, `post-${i}-snapshot-${name}`),
          ...snapshot,
        },
        update: snapshot,
      });
    }
  }
}

async function seedScenario(transaction: SeedTransaction, testCase: TestCase) {
  const { caseId, business, instagram } = testCase;
  const businessId = fixtureId(caseId, 'business');
  const businessData = {
    userId: ownerId,
    ...business,
    category: toCategory(business.category),
  };
  const metrics: SeedMetrics =
    testCase.recentMetrics ?? testCase.campaignHistory?.[0] ?? {};

  await transaction.orm.public.Business.upsert({
    create: { id: businessId, ...businessData },
    update: businessData,
  });

  if (instagram.connected) {
    const socialAccountId = fixtureId(caseId, 'social-account');
    const accountData = {
      businessId,
      platform: 'instagram' as const,
      platformAccountId: `mock:${caseId}`,
      username: `qa_${caseId.toLowerCase()}`,
      accountType: instagram.accountType,
      postCount: instagram.postCount,
      followerCount: instagram.followerCount,
      status: 'connected' as const,
      accessTokenEncrypted: null,
      tokenExpiresAt: null,
    };

    await transaction.orm.public.SocialAccount.upsert({
      create: { id: socialAccountId, ...accountData },
      update: accountData,
    });

    await seedPosts(
      transaction,
      caseId,
      socialAccountId,
      instagram.postCount,
      metrics,
    );
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test seed data must not be loaded in production.');
  }

  if (
    process.env.ENABLE_LIVE_INSTAGRAM_PUBLISH === 'true' ||
    process.env.ENABLE_TEST_MODE !== 'true'
  ) {
    throw new Error(
      'Seeding requires ENABLE_TEST_MODE=true and live Instagram publishing disabled.',
    );
  }

  const passwordHash = await hash(randomUUID(), 12);

  await db.transaction(async (transaction) => {
    await transaction.orm.public.User.upsert({
      create: {
        id: ownerId,
        name: 'GrowPilot QA Fixtures',
        email: 'qa-fixtures@growpilot.test',
        passwordHash,
        status: 'disabled',
      },
      update: { status: 'disabled' },
    });

    await Promise.all(
      testCases.map((testCase) => seedScenario(transaction, testCase)),
    );
  });

  console.log(
    `Seed completed: ${testCases.length} core QA scenarios with mock profiles, posts, and metric snapshots.`,
  );
}

async function run() {
  try {
    await main();
  } finally {
    await db.close();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
