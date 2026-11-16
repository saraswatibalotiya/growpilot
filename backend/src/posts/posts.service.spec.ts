import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { canTransition, EDITABLE_STATUSES } from './posts.state';
import { normaliseHashtags, PostsService } from './posts.service';

const OWNER_BIZ = 'biz-1';

/** Holds posts in memory and applies `decide` the way the transaction would. */
class FakePosts {
  rows = new Map<string, Record<string, unknown>>();
  images = new Map<string, Array<{ position: number; imageUrl: string }>>();
  imagesFor = jest.fn(async (postId: string) => this.images.get(postId) ?? []);
  imagesForMany = jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, this.images.get(id) ?? []])));
  create = jest.fn(async (id: string, businessId: string, data: Record<string, unknown>, imageUrls: string[] = []) => {
    const row = { id, businessId, status: 'DRAFT', ...data };
    this.rows.set(id, row);
    this.images.set(id, imageUrls.map((imageUrl, position) => ({ position, imageUrl })));
    return row;
  });
  findById = jest.fn(async (id: string) => this.rows.get(id) ?? null);
  deleteIfStatus = jest.fn(async (id: string, allowed: readonly string[]) => {
    const current = this.rows.get(id);
    if (!current) return { deleted: false, status: null };
    if (!allowed.includes(current['status'] as string)) return { deleted: false, status: current['status'] };
    this.rows.delete(id);
    this.images.delete(id);
    return { deleted: true, status: current['status'] };
  });
  publishedImageUrls = jest.fn(async (_businessId: string): Promise<string[]> => []);
  list = jest.fn();
  transact = jest.fn(async (id: string, decide: (c: Record<string, unknown>) => { data: Record<string, unknown>; status?: string; imageUrls?: string[] }) => {
    const current = this.rows.get(id);
    if (!current) return null;
    const decided = decide(current);
    const { data, status } = decided;
    const next = { ...current, ...data, ...(status ? { status } : {}) };
    this.rows.set(id, next);
    if (decided.imageUrls) this.images.set(id, decided.imageUrls.map((imageUrl, position) => ({ position, imageUrl })));
    return next;
  });
}

function build(opts: { productBiz?: string; conversationBiz?: string } = {}) {
  const posts = new FakePosts();
  const business = { primaryBusinessId: jest.fn().mockResolvedValue(OWNER_BIZ) };
  const products = { findById: jest.fn(async () => (opts.productBiz === undefined ? null : { id: 'p', businessId: opts.productBiz })) };
  const conversations = { findById: jest.fn(async () => (opts.conversationBiz === undefined ? null : { id: 'c', businessId: opts.conversationBiz })) };
  const media = { findBySecureUrl: jest.fn(async (url: string) => ({ businessId: 'biz-1', secureUrl: url, sha256: `hash:${url}` })) };
  const service = new PostsService(business as never, posts as never, products as never, conversations as never, media as never);
  return { service, posts, products, conversations };
}

async function draftWithStatus(posts: FakePosts, service: PostsService, status: string) {
  const post = await service.create('user-1', { caption: 'hello' });
  posts.rows.get(post.id)!['status'] = status;
  return post.id;
}

describe('post lifecycle rules', () => {
  it('allows the approval path and blocks skipping steps', () => {
    expect(canTransition('PREVIEW_READY', 'USER_APPROVED')).toBe(true);
    expect(canTransition('DRAFT', 'USER_APPROVED')).toBe(false);
    expect(canTransition('PUBLISHED', 'DRAFT')).toBe(false);
  });

  it('allows content edits only before approval', () => {
    expect(EDITABLE_STATUSES).toEqual(['DRAFT', 'CONTENT_GENERATED', 'PREVIEW_READY']);
    expect(EDITABLE_STATUSES).not.toContain('USER_APPROVED');
    expect(EDITABLE_STATUSES).not.toContain('PUBLISHING');
  });
});

describe('normaliseHashtags', () => {
  it('adds the # and removes inner spaces', () => {
    expect(normaliseHashtags(['CottonKurti', ' #New Collection '])).toEqual(['#CottonKurti', '#NewCollection']);
  });

  it('accepts Hindi and Marathi hashtags, including vowel signs', () => {
    expect(normaliseHashtags(['नयाकलेक्शन', '#लोकलशॉप', 'नवीनकलेक्शन'])).toEqual(['#नयाकलेक्शन', '#लोकलशॉप', '#नवीनकलेक्शन']);
  });

  it('rejects anything that is not a plain tag', () => {
    expect(() => normaliseHashtags(['bad<script>'])).toThrow(BadRequestException);
    expect(() => normaliseHashtags(['#'])).toThrow(BadRequestException);
  });
});

describe('PostsService', () => {
  it('creates a DRAFT for the owner business and ignores any status sent by the client', async () => {
    const { service, posts } = build();
    const post = await service.create('user-1', { caption: 'Hi' });
    expect(post).toMatchObject({ businessId: OWNER_BIZ, status: 'DRAFT' });
    expect(posts.create).toHaveBeenCalledWith(expect.any(String), OWNER_BIZ, expect.any(Object), []);
  });

  it('refuses a product that belongs to another business', async () => {
    const { service } = build({ productBiz: 'someone-else' });
    await expect(service.create('user-1', { productId: '33333333-3333-4333-8333-333333333333' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a conversation that belongs to another business', async () => {
    const { service } = build({ conversationBiz: 'someone-else' });
    await expect(service.create('user-1', { conversationId: '44444444-4444-4444-8444-444444444444' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves a PREVIEW_READY post', async () => {
    const { service, posts } = build();
    const id = await draftWithStatus(posts, service, 'PREVIEW_READY');
    await expect(service.update('user-1', id, { status: 'USER_APPROVED' })).resolves.toMatchObject({ status: 'USER_APPROVED' });
  });

  it('refuses to approve a DRAFT', async () => {
    const { service, posts } = build();
    const id = await draftWithStatus(posts, service, 'DRAFT');
    await expect(service.update('user-1', id, { status: 'USER_APPROVED' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses content edits after approval', async () => {
    const { service, posts } = build();
    const id = await draftWithStatus(posts, service, 'USER_APPROVED');
    await expect(service.update('user-1', id, { caption: 'changed after approval' })).rejects.toBeInstanceOf(ConflictException);
    expect(posts.rows.get(id)!['caption']).toBe('hello');
  });

  it('edits content and normalises hashtags on a preview', async () => {
    const { service, posts } = build();
    const id = await draftWithStatus(posts, service, 'PREVIEW_READY');
    const updated = await service.update('user-1', id, { headline: 'New arrival', hashtags: ['CottonKurti'] });
    expect(updated).toMatchObject({ headline: 'New arrival', hashtags: ['#CottonKurti'], status: 'PREVIEW_READY' });
  });

  it("never returns or changes another owner's post", async () => {
    const { service, posts } = build();
    const id = await draftWithStatus(posts, service, 'PREVIEW_READY');
    (service as unknown as { business: { primaryBusinessId: jest.Mock } }).business.primaryBusinessId.mockResolvedValue('other-biz');
    await expect(service.get('user-2', id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('user-2', id, { status: 'USER_APPROVED' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('moveTo enforces transitions for server-side changes', async () => {
    const { service, posts } = build();
    const id = await draftWithStatus(posts, service, 'DRAFT');
    await expect(service.moveTo(id, 'PUBLISHED')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.moveTo(id, 'CONTENT_GENERATED')).resolves.toMatchObject({ status: 'CONTENT_GENERATED' });
  });

  describe('carousel', () => {
    const OWN = (n: number) => `https://res.cloudinary.com/democloud/image/upload/v1/growpilot/biz-1/p${n}.jpg`;

    it('saves the photos in the order given, with the first as the cover', async () => {
      const { service, posts } = build();
      const post = await service.create('user-1', { imageUrls: [OWN(1), OWN(2), OWN(3)] });
      expect(post).toMatchObject({ originalImageUrl: OWN(1) });
      expect(post.images).toEqual([
        { position: 0, imageUrl: OWN(1) },
        { position: 1, imageUrl: OWN(2) },
        { position: 2, imageUrl: OWN(3) },
      ]);
      expect(posts.create).toHaveBeenCalledWith(expect.any(String), 'biz-1', expect.any(Object), [OWN(1), OWN(2), OWN(3)]);
    });

    it('treats a single originalImageUrl as a carousel of one, for older clients', async () => {
      const { service } = build();
      const post = await service.create('user-1', { originalImageUrl: OWN(1) });
      expect(post.images).toEqual([{ position: 0, imageUrl: OWN(1) }]);
    });

    it('keeps the same photo twice, so a cover and the real photo can both be used', async () => {
      const { service } = build();
      const post = await service.create('user-1', { imageUrls: [OWN(1), OWN(1), OWN(2)] });
      expect(post.images).toHaveLength(3);
    });

    describe('duplicates (by file content hash)', () => {
      it('refuses a photo whose content was already published, and creates nothing', async () => {
        const { service, posts } = build();
        posts.publishedImageUrls.mockResolvedValue([OWN(1)]);
        await expect(service.create('user-1', { imageUrls: [OWN(2), OWN(1)] })).rejects.toMatchObject({ response: { code: 'DUPLICATE_PHOTO' } });
        expect(posts.create).not.toHaveBeenCalled();
      });

      it('matches by content, so a different URL with the same bytes is still a duplicate', async () => {
        const { service, posts } = build();
        const media = (service as unknown as { media: { findBySecureUrl: jest.Mock } }).media;
        media.findBySecureUrl.mockImplementation(async (url: string) => ({ businessId: 'biz-1', secureUrl: url, sha256: 'same-bytes' }));
        posts.publishedImageUrls.mockResolvedValue([OWN(5)]);
        await expect(service.create('user-1', { imageUrls: [OWN(1)] })).rejects.toBeInstanceOf(ConflictException);
      });

      it('allows a photo that was not published, even if an unpublished draft uses it', async () => {
        const { service } = build();
        await service.create('user-1', { imageUrls: [OWN(1)] });
        await expect(service.create('user-1', { imageUrls: [OWN(1)] })).resolves.toMatchObject({ id: expect.any(String) });
      });

      it('also blocks adding a published photo to an existing draft', async () => {
        const { service, posts } = build();
        const post = await service.create('user-1', { imageUrls: [OWN(1)] });
        posts.rows.get(post.id as string)!['status'] = 'PREVIEW_READY';
        posts.publishedImageUrls.mockResolvedValue([OWN(7)]);
        await expect(service.update('user-1', post.id as string, { imageUrls: [OWN(7)] })).rejects.toBeInstanceOf(ConflictException);
      });

      it('allows the same picture twice in one post', async () => {
        const { service } = build();
        const media = (service as unknown as { media: { findBySecureUrl: jest.Mock } }).media;
        media.findBySecureUrl.mockImplementation(async (url: string) => ({ businessId: 'biz-1', secureUrl: url, sha256: 'same-bytes' }));
        await expect(service.create('user-1', { imageUrls: [OWN(1), OWN(2)] })).resolves.toMatchObject({ id: expect.any(String) });
      });
    });

    describe('deleting a pending draft', () => {
      it('deletes a draft that is not approved yet, with its photos', async () => {
        for (const status of ['DRAFT', 'CONTENT_GENERATED', 'PREVIEW_READY']) {
          const { service, posts } = build();
          const post = await service.create('user-1', { imageUrls: [OWN(1)] });
          posts.rows.get(post.id as string)!['status'] = status;
          await service.remove('user-1', post.id as string);
          expect(posts.rows.has(post.id as string)).toBe(false);
          expect(posts.images.has(post.id as string)).toBe(false);
        }
      });

      it('keeps approved, publishing, published and failed posts', async () => {
        for (const status of ['USER_APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED']) {
          const { service, posts } = build();
          const post = await service.create('user-1', { imageUrls: [OWN(1)] });
          posts.rows.get(post.id as string)!['status'] = status;
          await expect(service.remove('user-1', post.id as string)).rejects.toBeInstanceOf(ConflictException);
          expect(posts.rows.has(post.id as string)).toBe(true);
        }
      });

      it("treats another business's post, or a missing one, as not found", async () => {
        const { service, posts } = build();
        await expect(service.remove('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
        posts.rows.set('x', { id: 'x', businessId: 'other', status: 'DRAFT' });
        await expect(service.remove('user-1', 'x')).rejects.toBeInstanceOf(NotFoundException);
        expect(posts.deleteIfStatus).not.toHaveBeenCalled();
      });
    });

    describe('reopening an approved draft', () => {
      it('moves USER_APPROVED back to PREVIEW_READY so it can be edited, then approved again', async () => {
        const { service, posts } = build();
        const post = await service.create('user-1', { imageUrls: [OWN(1)], caption: 'Hi' });
        posts.rows.get(post.id as string)!['status'] = 'USER_APPROVED';
        const reopened = await service.update('user-1', post.id as string, { status: 'PREVIEW_READY' });
        expect(reopened).toMatchObject({ status: 'PREVIEW_READY' });
        await expect(service.update('user-1', post.id as string, { caption: 'Changed' })).resolves.toMatchObject({ caption: 'Changed' });
        await expect(service.update('user-1', post.id as string, { status: 'USER_APPROVED' })).resolves.toMatchObject({ status: 'USER_APPROVED' });
      });

      it('cannot reopen anything that is not approved (a draft, a post being published, or a published post)', async () => {
        for (const status of ['DRAFT', 'PREVIEW_READY', 'PUBLISHING', 'PUBLISHED', 'FAILED']) {
          const { service, posts } = build();
          const post = await service.create('user-1', { imageUrls: [OWN(1)] });
          posts.rows.get(post.id as string)!['status'] = status;
          await expect(service.update('user-1', post.id as string, { status: 'PREVIEW_READY' })).rejects.toBeInstanceOf(ConflictException);
        }
      });
    });

    it('refuses more than 10 photos', async () => {
      const { service } = build();
      const urls = Array.from({ length: 11 }, (_, i) => OWN(i));
      await expect(service.create('user-1', { imageUrls: urls })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a photo that is another shop's upload, and any photo not uploaded through GrowPilot", async () => {
      const { service, posts } = build();
      const media = (service as unknown as { media: { findBySecureUrl: jest.Mock } }).media;
      media.findBySecureUrl.mockResolvedValueOnce({ businessId: 'other-biz', secureUrl: OWN(9) });
      await expect(service.create('user-1', { imageUrls: [OWN(1), OWN(9)] })).rejects.toBeInstanceOf(BadRequestException);
      media.findBySecureUrl.mockResolvedValueOnce(null);
      await expect(service.create('user-1', { imageUrls: ['https://res.cloudinary.com/democloud/image/upload/x.jpg'] })).rejects.toBeInstanceOf(BadRequestException);
      expect(posts.create).not.toHaveBeenCalled();
    });

    it('replaces the carousel before approval', async () => {
      const { service, posts } = build();
      const post = await service.create('user-1', { imageUrls: [OWN(1)] });
      posts.rows.get(post.id as string)!['status'] = 'PREVIEW_READY';
      const updated = await service.update('user-1', post.id as string, { imageUrls: [OWN(2), OWN(3)] });
      expect(updated.images).toEqual([
        { position: 0, imageUrl: OWN(2) },
        { position: 1, imageUrl: OWN(3) },
      ]);
      expect(updated).toMatchObject({ originalImageUrl: OWN(2) });
    });

    it('cannot change the carousel after approval', async () => {
      const { service, posts } = build();
      const post = await service.create('user-1', { imageUrls: [OWN(1)] });
      posts.rows.get(post.id as string)!['status'] = 'USER_APPROVED';
      await expect(service.update('user-1', post.id as string, { imageUrls: [OWN(2)] })).rejects.toBeInstanceOf(ConflictException);
      expect(posts.images.get(post.id as string)).toEqual([{ position: 0, imageUrl: OWN(1) }]);
    });
  });
});
