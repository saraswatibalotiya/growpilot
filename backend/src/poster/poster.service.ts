import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { cleanPrice } from '../ai/facts';
import { ImageAnalysisService } from '../ai/image-analysis.service';
import { BusinessRepository } from '../business/business.repository';
import { CloudinaryClient } from '../media/cloudinary.client';
import { MediaRepository } from '../media/media.repository';
import { StudioService } from '../media/studio/studio.service';
import { PostsService } from '../posts/posts.service';
import { ProductsRepository } from '../products/products.repository';
import {
  acceptOwnerDesign,
  dmCallToAction,
  formatPrice,
  InvalidDesignError,
  TEMPLATE_INFO,
  TEMPLATES,
  BACKGROUND_STYLES,
  PHOTO_TREATMENTS,
  ALIGNMENTS,
  FONT_STYLES,
  PRICE_POSITIONS,
  TEXT_POSITIONS,
  type PosterDesign,
  type VerifiedFacts,
} from './poster-design';
import { PosterDesignService, type ClaudeUsage } from './poster-design.service';
import { CANVAS } from './poster-layout';
import { PosterRenderError, renderPoster } from './poster-renderer';
import type { EditPosterDto, GeneratePosterDto, PosterBaseDto, RenderPosterDto, SavePosterDto } from './poster.dto';
import { POSTER_PROMPT_VERSION } from './poster.prompts';

/** Bump when the drawing changes, so stored posters made with old settings are not reused. */
const RENDER_VERSION = 'poster-render-v3';

type Asset = Awaited<ReturnType<StudioService['owned']>>;
type ProductView = { price: string | null; currency?: string | null; category: string | null; businessId: string };

interface Context {
  businessId: string;
  shopName: string;
  category: string | null;
  /** The photo the poster is drawn from: the Gemini-enhanced copy when there is one, otherwise the owner's photo. */
  asset: Asset;
  /** The owner's photo as chosen. Never modified. */
  original: Asset;
  rootId: string;
  enhancement: { used: boolean; cached: boolean; model: string | null; costUsd: number | null };
  /** Plain-language notes that belong to every poster made from this request. */
  notes: string[];
  facts: VerifiedFacts;
  text: { headline: string; callToAction: string };
  language: string | null;
}

const sumUsage = (usage: ClaudeUsage[]) =>
  usage.length ? { model: usage.map((u) => u.model).join(' + '), inputTokens: usage.reduce((n, u) => n + u.inputTokens, 0), outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0) } : null;

@Injectable()
export class PosterService {
  private readonly logger = new Logger(PosterService.name);

  constructor(
    private readonly media: MediaRepository,
    private readonly businesses: BusinessRepository,
    private readonly products: ProductsRepository,
    private readonly posts: PostsService,
    private readonly studio: StudioService,
    private readonly images: ImageAnalysisService,
    private readonly designer: PosterDesignService,
    private readonly cloudinary: CloudinaryClient,
  ) {}

  /** The choices the frontend offers. Offer Poster is only usable with an offer. */
  options() {
    return {
      templates: TEMPLATES.map((id) => ({ id, name: TEMPLATE_INFO[id].name, summary: TEMPLATE_INFO[id].summary, needsOffer: TEMPLATE_INFO[id].needsOffer, defaults: TEMPLATE_INFO[id].defaults })),
      backgroundStyles: BACKGROUND_STYLES,
      photoTreatments: PHOTO_TREATMENTS,
      fontStyles: FONT_STYLES,
      alignments: ALIGNMENTS,
      textPositions: TEXT_POSITIONS,
      pricePositions: PRICE_POSITIONS,
      canvas: CANVAS,
      promptVersion: POSTER_PROMPT_VERSION,
    };
  }

  /** Everything a request is allowed to rely on, checked for ownership. The price and offer are decided here, in code. */
  private async context(userId: string, dto: PosterBaseDto): Promise<Context> {
    const business = await this.businesses.findPrimaryForUser(userId);
    if (!business) throw new NotFoundException('Business not found');
    const asset = await this.photo(userId, dto);
    if (asset.variant === 'poster') throw new BadRequestException('Choose a product photo, not a finished poster');
    const root = await this.studio.source(asset);
    const enhanced = await this.enhance(userId, asset, dto);

    const post = dto.postId ? ((await this.posts.get(userId, dto.postId)) as unknown as { headline: string | null; callToAction: string | null; productId: string | null }) : null;

    const productId = dto.productId ?? post?.productId ?? null;
    let product: ProductView | null = null;
    if (productId) {
      const found = (await this.products.findById(productId)) as ProductView | null;
      if (!found || found.businessId !== business.id) throw new NotFoundException('Product not found');
      product = found;
    }

    // The price: what the owner typed, else the product record. Never anything else.
    let price: string | null = null;
    let priceSource: VerifiedFacts['priceSource'] = null;
    if (dto.price !== undefined) {
      price = cleanPrice(dto.price);
      if (!price) throw new BadRequestException('That price could not be read. Use digits, for example 899.');
      priceSource = 'owner';
    } else if (product?.price) {
      price = cleanPrice(String(product.price));
      priceSource = price ? 'product' : null;
    }

    const offer = dto.offer ? dto.offer.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() || null : null;

    return {
      businessId: business.id,
      shopName: business.name,
      category: product?.category ?? business.category ?? null,
      asset: enhanced.asset,
      original: asset,
      rootId: root.id,
      enhancement: enhanced.info,
      notes: enhanced.note ? [enhanced.note] : [],
      facts: { price, priceSource, currency: product?.currency ?? 'INR', offer },
      text: { headline: dto.headline ?? post?.headline ?? '', callToAction: dmCallToAction(dto.language) },
      language: dto.language ?? null,
    };
  }

  /**
   * Gemini's gentle "enhance": the same photo, tidied, with the product filling a 4:5 frame, so the poster is not a small
   * product on a big backdrop. The result is a separate stored copy (the original is never touched) and is cached, so
   * redrawing a poster costs nothing. If Gemini is off, busy or over today's limit the poster is still made from the
   * owner's own photo, and the notes say that the enhancement was skipped and why.
   */
  private async enhance(userId: string, asset: Asset, dto: PosterBaseDto): Promise<{ asset: Asset; info: Context['enhancement']; note: string | null }> {
    const none = { used: false, cached: false, model: null, costUsd: null };
    if (dto.enhance === false || asset.variant === 'ai_edited' || !this.studio.aiEditingAvailable()) return { asset, info: none, note: null };
    try {
      const edit = await this.studio.aiEdit(userId, { mediaId: asset.id, format: 'portrait', style: 'enhance' } as never);
      const copy = await this.studio.owned(userId, edit.result.id);
      return { asset: copy, info: { used: true, cached: edit.usage.cached, model: edit.usage.claude?.model ?? null, costUsd: edit.usage.externalEditorUsd }, note: edit.warnings[0] ?? null };
    } catch (error) {
      const reason = error instanceof HttpException ? error.message : 'an unexpected problem';
      this.logger.warn({ event: 'poster_enhance_skipped', mediaId: asset.id, reason });
      return { asset, info: none, note: `We couldn't enhance the photo with AI (${reason}), so your original photo is used.` };
    }
  }

  /** The photo, by id or by URL. Either way it must belong to the caller's business, and anyone else gets the same 404. */
  private async photo(userId: string, dto: PosterBaseDto): Promise<Asset> {
    if (dto.mediaId) return this.studio.owned(userId, dto.mediaId);
    if (!dto.imageUrl) throw new BadRequestException('Send mediaId or imageUrl for the photo to use');
    const found = await this.media.findBySecureUrl(dto.imageUrl);
    if (!found) throw new NotFoundException('Media not found');
    return this.studio.owned(userId, found.id);
  }

  /** Step 1: Claude designs the poster from the photo, then it is drawn. */
  async generate(userId: string, dto: GeneratePosterDto) {
    const ctx = await this.context(userId, dto);
    if (dto.template === 'offer_poster' && !ctx.facts.offer) throw new BadRequestException('The Offer Poster needs an offer. Type the offer you want shown.');
    const imageUrl = await this.images.validate(ctx.businessId, ctx.asset.secureUrl);
    const outcome = await this.designer.design({
      imageUrl,
      prompt: { shopName: ctx.shopName, category: ctx.category, headline: ctx.text.headline, callToAction: ctx.text.callToAction, language: ctx.language, offerProvided: !!ctx.facts.offer, priceAvailable: !!ctx.facts.price },
      facts: ctx.facts,
      text: ctx.text,
      forceTemplate: dto.template,
    });
    return this.finish(ctx, outcome.design, { notes: outcome.notes, source: outcome.source, reasoning: outcome.reasoning, claude: outcome.usage });
  }

  /** The owner changed a selector (template, background, treatment, price badge). Drawn again without any AI call. */
  async render(userId: string, dto: RenderPosterDto) {
    const ctx = await this.context(userId, dto);
    const accepted = this.acceptDesign(dto.design, ctx.facts);
    return this.finish(ctx, accepted.design, { notes: accepted.notes, source: 'owner', reasoning: null, claude: [] });
  }

  /** A short instruction ("make it look premium"): Haiku turns it into a small change, then it is drawn. */
  async edit(userId: string, dto: EditPosterDto) {
    const ctx = await this.context(userId, dto);
    const current = this.acceptDesign(dto.design, ctx.facts).design;
    const outcome = await this.designer.edit({ design: current, instruction: dto.instruction, facts: ctx.facts });
    if ('clarification' in outcome) {
      return { requiresClarification: true as const, clarificationQuestion: outcome.clarification, design: current, usage: { cached: false, claude: sumUsage(outcome.usage), sharpMs: 0 } };
    }
    const result = await this.finish(ctx, outcome.design, { notes: outcome.notes, source: 'ai' as const, reasoning: null, claude: outcome.usage });
    return { ...result, requiresClarification: false as const, changesApplied: outcome.changesApplied };
  }

  /** Attaches a finished poster to a post (before approval). The original photos on the post are not touched. */
  async save(userId: string, posterId: string, dto: SavePosterDto) {
    const asset = await this.studio.owned(userId, posterId);
    if (asset.variant !== 'poster') throw new BadRequestException('That is not a poster');
    const post = await this.posts.update(userId, dto.postId, { posterImageUrl: asset.secureUrl } as never);
    return { poster: this.view(asset), post };
  }

  // ---------- internals ----------

  private acceptDesign(input: unknown, facts: VerifiedFacts) {
    try {
      return acceptOwnerDesign(input, facts);
    } catch (error) {
      if (error instanceof InvalidDesignError) throw new BadRequestException({ message: 'The poster design is not valid', problems: error.problems });
      throw error;
    }
  }

  private view(asset: Asset) {
    return { id: asset.id, url: asset.secureUrl, width: asset.width, height: asset.height, bytes: asset.bytes, createdAt: asset.createdAt };
  }

  private async finish(ctx: Context, design: PosterDesign, meta: { notes: string[]; source: 'ai' | 'template' | 'owner'; reasoning: string | null; claude: ClaudeUsage[] }) {
    // `verified` is the owner's real price whether or not the badge is on, so the UI can offer to turn it back on.
    const verified = formatPrice(ctx.facts.price, ctx.facts.currency);
    const priceText = design.showPrice ? verified : null;
    const offerText = design.template === 'offer_poster' ? ctx.facts.offer : null;
    const key = createHash('sha256').update(JSON.stringify([ctx.asset.sha256, design, priceText, offerText, RENDER_VERSION])).digest('hex');

    const base = {
      design,
      price: verified ? { text: verified, source: ctx.facts.priceSource, shown: priceText !== null } : null,
      offer: offerText,
      template: { id: design.template, name: TEMPLATE_INFO[design.template].name },
      notes: [...ctx.notes, ...meta.notes],
      enhancement: ctx.enhancement,
      source: meta.source,
      reasoning: meta.reasoning,
      original: this.view(ctx.original),
    };

    const existing = await this.media.findVariant(ctx.rootId, key);
    if (existing) return { ...base, poster: this.view(existing as Asset), usage: { cached: true, claude: sumUsage(meta.claude), sharpMs: 0 } };

    const photo = await this.studio.download(ctx.asset.secureUrl);
    const started = Date.now();
    let rendered: Awaited<ReturnType<typeof renderPoster>>;
    try {
      rendered = await renderPoster({ photo, design, priceText, offerText });
    } catch (error) {
      if (error instanceof PosterRenderError) throw new UnprocessableEntityException(error.message);
      this.logger.error({ event: 'poster_render_failed', mediaId: ctx.asset.id, message: (error as Error).message });
      throw new UnprocessableEntityException('The poster could not be drawn. Your photo was not changed. Please try again or choose another photo.');
    }
    const sharpMs = Date.now() - started;

    const info = await sharp(rendered.buffer).metadata();
    if (info.format !== 'jpeg' || info.width !== CANVAS.width || info.height !== CANVAS.height) {
      this.logger.error({ event: 'poster_output_invalid', width: info.width, height: info.height });
      throw new UnprocessableEntityException('The poster did not pass its quality check. Your photo was not changed.');
    }

    const stored = await this.cloudinary.upload(rendered.buffer, 'image/jpeg', `growpilot/${ctx.businessId}/posters`, 'poster.jpg');
    try {
      const asset = await this.media.create(randomUUID(), {
        businessId: ctx.businessId,
        cloudinaryPublicId: stored.publicId,
        secureUrl: stored.secureUrl,
        mimeType: 'image/jpeg',
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        sha256: createHash('sha256').update(rendered.buffer).digest('hex'),
        sourceAssetId: ctx.rootId,
        variant: 'poster',
        processingKey: key,
        processingJson: { kind: 'poster', version: RENDER_VERSION, design, price: priceText ? { text: priceText, source: ctx.facts.priceSource } : null, offer: offerText, photoAssetId: ctx.asset.id },
      });
      return { ...base, poster: this.view(asset as Asset), usage: { cached: false, claude: sumUsage(meta.claude), sharpMs } };
    } catch (error) {
      const winner = await this.media.findVariant(ctx.rootId, key); // a parallel request stored the same poster first
      if (winner) return { ...base, poster: this.view(winner as Asset), usage: { cached: true, claude: sumUsage(meta.claude), sharpMs } };
      throw error;
    }
  }
}
