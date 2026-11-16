import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { ConversationsRepository } from '../conversations/conversations.repository';
import { PostsRepository } from '../posts/posts.repository';
import { ProductsRepository } from '../products/products.repository';
import { cleanPrice } from './facts';
import { ConversationSummarySchema, type ConversationSummary, type Language } from './schemas';

const RECENT_POSTS = 5;
const RECENT_MESSAGES = 6;
const MESSAGE_CHARS = 500;

export interface ProductFacts {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  /** Digits only, or null when the record has no price. */
  price: string | null;
  isAvailable: boolean;
  imageUrl: string | null;
}

export interface BusinessContext {
  businessId: string;
  business: {
    name: string;
    category: string;
    description: string | null;
    city: string | null;
    area: string | null;
    targetAudience: string | null;
    preferredLanguage: Language | null;
  };
  product: ProductFacts | null;
  recentPosts: Array<{ headline: string | null; caption: string | null; callToAction: string | null; hashtags: string[] | null; language: string | null; status: string }>;
  conversation: {
    id: string;
    summary: ConversationSummary | null;
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
  /** Facts we know we do not have. Shown to the model as missing, never guessed. */
  missing: string[];
}

/**
 * Builds the trusted context for a request from the existing database: the shop, the product,
 * the last few approved or published posts, and the conversation so far. Everything is scoped to the signed-in
 * owner's business, so another owner's data can never reach a prompt.
 */
@Injectable()
export class BusinessContextService {
  constructor(
    private readonly business: BusinessService,
    private readonly products: ProductsRepository,
    private readonly posts: PostsRepository,
    private readonly conversations: ConversationsRepository,
  ) {}

  async build(userId: string, input: { conversationId: string; productId?: string }): Promise<BusinessContext> {
    const profile = await this.business.getProfile(userId);
    const conversation = await this.assertConversation(profile.id, input.conversationId);

    const [product, recentPosts, messages] = await Promise.all([
      input.productId ? this.ownedProduct(profile.id, input.productId) : Promise.resolve(null),
      this.recentPosts(profile.id),
      this.conversations.listMessages(conversation.id, 100),
    ]);

    const summaryMessage = [...messages].reverse().find((m) => m.role === 'system' && isSummary(m.metadata));
    const summary = summaryMessage ? ConversationSummarySchema.safeParse((summaryMessage.metadata as { summary?: unknown }).summary) : null;

    const missing = ['current discount or offer', 'shop address', 'contact details', 'stock levels', 'delivery promises', 'warranty', 'customer testimonials'];
    if (!product) missing.push('product record (none selected)');
    else if (!product.price) missing.push('product price');

    return {
      businessId: profile.id,
      business: {
        name: profile.name,
        category: profile.category,
        description: profile.description,
        city: profile.city,
        area: profile.area,
        targetAudience: profile.targetAudience,
        preferredLanguage: (profile.preferredLanguage as Language | null) ?? null,
      },
      product,
      recentPosts,
      conversation: {
        id: conversation.id,
        summary: summary?.success ? summary.data : null,
        recentMessages: messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-RECENT_MESSAGES)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, MESSAGE_CHARS) })),
      },
      missing,
    };
  }

  /** 404 when the conversation isn't the owner's, so existence isn't revealed. */
  async assertConversation(businessId: string, conversationId: string) {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation || conversation.businessId !== businessId) throw new NotFoundException('Conversation not found');
    if (conversation.status !== 'active') throw new ConflictException('This conversation is closed');
    return conversation;
  }

  private async ownedProduct(businessId: string, productId: string): Promise<ProductFacts> {
    const product = await this.products.findById(productId);
    if (!product || product.businessId !== businessId) throw new NotFoundException('Product not found');
    return {
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      category: product.category ?? null,
      price: cleanPrice(product.price ?? null),
      isAvailable: product.isAvailable,
      imageUrl: product.imageUrl ?? null,
    };
  }

  /** The last few approved or published posts, as style reference only. */
  private async recentPosts(businessId: string): Promise<BusinessContext['recentPosts']> {
    const [published, approved] = await Promise.all([
      this.posts.list(businessId, 'PUBLISHED', RECENT_POSTS, 0),
      this.posts.list(businessId, 'USER_APPROVED', RECENT_POSTS, 0),
    ]);
    return [...published, ...approved]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, RECENT_POSTS)
      .map((p) => ({
        headline: p.headline ?? null,
        caption: p.caption ?? null,
        callToAction: p.callToAction ?? null,
        hashtags: (p.hashtags as string[] | null) ?? null,
        language: p.language ?? null,
        status: String(p.status),
      }));
  }

  /** The trusted facts as JSON for the prompt. Missing values are explicit nulls and a "not provided" list. */
  factsJson(ctx: BusinessContext, extra?: Record<string, unknown>): string {
    return JSON.stringify(
      {
        shop: ctx.business,
        product: ctx.product ? { name: ctx.product.name, category: ctx.product.category, description: ctx.product.description, price: ctx.product.price } : null,
        recentApprovedPosts: ctx.recentPosts,
        notProvided: ctx.missing,
        ...extra,
      },
      null,
      1,
    );
  }
}

function isSummary(metadata: unknown): boolean {
  return typeof metadata === 'object' && metadata !== null && (metadata as { kind?: unknown }).kind === 'summary';
}
