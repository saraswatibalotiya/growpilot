import { ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessContextService } from './business-context.service';

const profile = { id: 'biz-1', name: 'Shree Fashion Studio', category: 'clothing', description: null, city: 'Mumbai', area: null, targetAudience: null, preferredLanguage: 'hi' };
const post = (n: number, status: string, createdAt: string) => ({ headline: `H${n}`, caption: `C${n}`, callToAction: 'CTA', hashtags: ['#a'], language: 'hi', status, createdAt });

function build(over: { conversation?: unknown; product?: unknown; messages?: unknown[]; published?: unknown[]; approved?: unknown[] } = {}) {
  const business = { getProfile: jest.fn().mockResolvedValue(profile) };
  const products = { findById: jest.fn().mockResolvedValue(over.product === undefined ? { id: 'p1', businessId: 'biz-1', name: 'Cotton kurti', description: null, category: 'kurti', price: '899.00', isAvailable: true, imageUrl: null } : over.product) };
  const posts = { list: jest.fn(async (_b: string, status: string) => (status === 'PUBLISHED' ? (over.published ?? []) : (over.approved ?? []))) };
  const conversations = {
    findById: jest.fn().mockResolvedValue(over.conversation === undefined ? { id: 'conv-1', businessId: 'biz-1', status: 'active' } : over.conversation),
    listMessages: jest.fn().mockResolvedValue(over.messages ?? []),
  };
  return { service: new BusinessContextService(business as never, products as never, posts as never, conversations as never), business, products, posts, conversations };
}

describe('BusinessContextService', () => {
  it('builds the shop, product and history from the existing records', async () => {
    const { service } = build();
    const ctx = await service.build('u1', { conversationId: 'conv-1', productId: 'p1' });
    expect(ctx.business).toMatchObject({ name: 'Shree Fashion Studio', preferredLanguage: 'hi' });
    expect(ctx.product).toMatchObject({ name: 'Cotton kurti', price: '899' });
  });

  it('marks missing facts as missing instead of inventing them', async () => {
    const { service } = build({ product: { id: 'p1', businessId: 'biz-1', name: 'Kurti', description: null, category: null, price: null, isAvailable: true, imageUrl: null } });
    const withProduct = await service.build('u1', { conversationId: 'conv-1', productId: 'p1' });
    expect(withProduct.product?.price).toBeNull();
    expect(withProduct.missing).toEqual(expect.arrayContaining(['product price', 'current discount or offer', 'shop address', 'contact details']));
    const noProduct = await build().service.build('u1', { conversationId: 'conv-1' });
    expect(noProduct.product).toBeNull();
    expect(noProduct.missing).toContain('product record (none selected)');
    const facts = JSON.parse(service2(noProduct));
    expect(facts.product).toBeNull();
    expect(facts.notProvided).toContain('shop address');
  });

  it('uses only the last five approved or published posts, newest first', async () => {
    const published = [1, 2, 3, 4].map((n) => post(n, 'PUBLISHED', `2026-11-0${n}T00:00:00Z`));
    const approved = [5, 6, 7].map((n) => post(n, 'USER_APPROVED', `2026-11-0${n}T00:00:00Z`));
    const { service, posts } = build({ published, approved });
    const ctx = await service.build('u1', { conversationId: 'conv-1' });
    expect(ctx.recentPosts).toHaveLength(5);
    expect(ctx.recentPosts.map((p) => p.headline)).toEqual(['H7', 'H6', 'H5', 'H4', 'H3']);
    expect(posts.list).toHaveBeenCalledWith('biz-1', 'PUBLISHED', 5, 0);
    expect(posts.list).toHaveBeenCalledWith('biz-1', 'USER_APPROVED', 5, 0);
  });

  it('keeps a short recent history and the stored summary, and never sends summaries as messages', async () => {
    const messages = [
      ...Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`, metadata: null })),
      { role: 'system', content: 'summary', metadata: { kind: 'summary', summary: { businessAndProduct: 'Kurtis', currentIntent: 'CREATE', draftStatus: 'DRAFT', confirmedFacts: [], ownerPreferences: [], pendingQuestions: [] } } },
    ];
    const ctx = await build({ messages }).service.build('u1', { conversationId: 'conv-1' });
    expect(ctx.conversation.recentMessages).toHaveLength(6);
    expect(ctx.conversation.recentMessages.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
    expect(ctx.conversation.summary?.currentIntent).toBe('CREATE');
  });

  it('ignores a stored summary that no longer matches the schema', async () => {
    const messages = [{ role: 'system', content: 's', metadata: { kind: 'summary', summary: { nope: true } } }];
    expect((await build({ messages }).service.build('u1', { conversationId: 'conv-1' })).conversation.summary).toBeNull();
  });

  it("answers 404 for another owner's conversation or product, and 409 for a closed conversation", async () => {
    await expect(build({ conversation: { id: 'c', businessId: 'other', status: 'active' } }).service.build('u1', { conversationId: 'c' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ conversation: null }).service.build('u1', { conversationId: 'c' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ conversation: { id: 'c', businessId: 'biz-1', status: 'closed' } }).service.build('u1', { conversationId: 'c' })).rejects.toBeInstanceOf(ConflictException);
    await expect(build({ product: { id: 'p', businessId: 'other', name: 'x', price: '1' } }).service.build('u1', { conversationId: 'c', productId: 'p' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

function service2(ctx: Awaited<ReturnType<BusinessContextService['build']>>): string {
  return new BusinessContextService(null as never, null as never, null as never, null as never).factsJson(ctx);
}
