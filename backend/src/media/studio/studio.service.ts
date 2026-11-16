import { createHash, randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readAiConfig } from '../../ai/ai.config';
import { BusinessRepository } from '../../business/business.repository';
import { CloudinaryClient } from '../cloudinary.client';
import { MediaRepository } from '../media.repository';
import { profileFor, type InstagramFormat, type ProductCategory } from './enhance-profiles';
import { assess, measure, type ImageMetrics } from './image-quality';
import { GeminiUsageRepository } from './gemini-usage.repository';
import { ImageEditingRegistry, PRESERVE_PRODUCT_PROMPT, VISUAL_STYLES, type VisualStyle } from './image-editing.provider';
import { checkOutput } from './output-checks';
import { PHOTO_ANALYSIS_VERSION, PhotoAnalysisService, type PhotoAnalysis } from './photo-analysis.service';
import { enhance } from './sharp-pipeline';
import type { AiEditMediaDto, AnalyzeMediaDto, EnhanceMediaDto } from './studio.dto';

/** Bump when the enhancement maths changes, so old cached results are not reused for new settings. */
const PIPELINE_VERSION = 'sharp-v1';
const ANALYSIS_KIND = 'photo-analysis';
const REEL_SCENE_VERSION = 'scene-v3';
/** The Reel frame is 9:16 and the product is the hero: it must look big, not like a small object floating in the middle. */
const REEL_SCENE_HINT =
  'This is a full-screen vertical 9:16 Reel frame. Make the product LARGE and centred: nearly the full width of the frame and about two thirds of its height. Keep the top 12% and bottom 20% of the frame calm and uncluttered for on-screen text.';
/** How far the product colour may drift (see OutputCheck.colourShift) before a retry, and before the result is refused. */
const REEL_COLOUR_RETRY_ABOVE = 0.025;
const REEL_COLOUR_REJECT_ABOVE = 0.06;
const REEL_COLOUR_RETRY_HINT = "IMPORTANT: your previous attempt changed the product's colour. Match the product's exact original colour, hue and saturation. Do not neutralise, cool down or whiten it.";
const REEL_ENHANCE_HINT =
  'This is a full-screen vertical 9:16 Reel frame. The product must fill the frame: as large as possible, centred slightly above the middle, covering about 80 to 84% of the frame width with an even margin of at least 8% on both sides, because the camera zooms in slowly. Nothing may touch or cross the frame edge. Keep the top 12% and bottom 20% of the frame plain and uncluttered for on-screen text.';
/** A cut-off product may be padded by at most this share of the framed width or height before we ask for a retake. */
const MAX_BLANK_SHARE = 0.12;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
/** Claude accepts images up to 5 MB; larger originals are sent as a resized copy served by Cloudinary. */
const CLAUDE_MAX_BYTES = 5 * 1024 * 1024;

type Asset = NonNullable<Awaited<ReturnType<MediaRepository['findById']>>>;

export interface UsageBreakdown {
  /** True when a stored result was returned and nothing was processed. */
  cached: boolean;
  claude: { model: string; inputTokens: number; outputTokens: number } | null;
  /** Local processing time. Free: no external call. */
  sharpMs: number;
  /** Charge from an external image editor, if one ran. */
  externalEditorUsd: number | null;
}

const noUsage = (cached: boolean): UsageBreakdown => ({ cached, claude: null, sharpMs: 0, externalEditorUsd: null });

@Injectable()
export class StudioService {
  private readonly logger = new Logger(StudioService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly media: MediaRepository,
    private readonly businesses: BusinessRepository,
    private readonly cloudinary: CloudinaryClient,
    private readonly photoAnalysis: PhotoAnalysisService,
    private readonly editors: ImageEditingRegistry,
    private readonly usage: GeminiUsageRepository,
  ) {}

  view(asset: Asset) {
    return {
      id: asset.id,
      url: asset.secureUrl,
      variant: asset.variant,
      sourceAssetId: asset.sourceAssetId,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      approved: asset.approvedAt != null,
      createdAt: asset.createdAt,
    };
  }

  /** The asset must belong to the caller's business; anyone else gets the same 404. */
  async owned(userId: string, mediaId: string): Promise<Asset> {
    const asset = await this.media.findById(mediaId);
    const business = await this.businesses.findPrimaryForUser(userId);
    if (!asset || !business || asset.businessId !== business.id) throw new NotFoundException('Media not found');
    return asset as Asset;
  }

  /** Variants always point back to the owner's original, which is what every processing step starts from. */
  async source(asset: Asset): Promise<Asset> {
    if (!asset.sourceAssetId) return asset;
    const original = await this.media.findById(asset.sourceAssetId);
    if (!original) throw new NotFoundException('Media not found');
    return original as Asset;
  }

  async download(url: string): Promise<Buffer> {
    const cfg = readAiConfig(this.config);
    const host = new URL(url).hostname.toLowerCase();
    if (!cfg.trustedImageHosts.includes(host)) throw new UnprocessableEntityException('This photo is not stored in GrowPilot storage');
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new BadGatewayException('Could not load the photo from storage. Please try again.');
    }
    if (!response.ok) throw new BadGatewayException('Could not load the photo from storage. Please try again.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) throw new UnprocessableEntityException('This photo is too large to process');
    return buffer;
  }

  private cachedAnalysis(sourceId: string) {
    return this.media.findAnalysis(sourceId, ANALYSIS_KIND, PHOTO_ANALYSIS_VERSION);
  }

  private categoryFor(requested: string | undefined, analysis: PhotoAnalysis | null): ProductCategory {
    return profileFor(requested ?? analysis?.productCategory).category;
  }

  private qualityView(metrics: ImageMetrics) {
    const a = assess(metrics);
    return { score: a.score, verdict: a.verdict, problems: a.problems, actions: a.actions, messages: a.messages, product: metrics.product, width: metrics.width, height: metrics.height };
  }

  /** Stages A and C. The quality check is free and always runs; Claude runs only when asked, only if it can help, and only once per photo. */
  async analyze(userId: string, dto: AnalyzeMediaDto) {
    return { ...(await this.analyzeCore(userId, dto)), aiEditingAvailable: this.editors.external() !== null };
  }

  private async analyzeCore(userId: string, dto: AnalyzeMediaDto) {
    const source = await this.source(await this.owned(userId, dto.mediaId));
    const metrics = await measure(await this.download(source.secureUrl));
    const quality = this.qualityView(metrics);
    const wantAi = dto.useAi !== false;

    if (!wantAi) return { mediaId: source.id, quality, analysis: null, note: null, usage: noUsage(false) };
    if (quality.verdict === 'reupload') {
      return { mediaId: source.id, quality, analysis: null, note: 'This photo needs to be retaken, so no AI analysis was run.', usage: noUsage(false) };
    }

    if (!dto.refresh) {
      const stored = await this.cachedAnalysis(source.id);
      if (stored) return { mediaId: source.id, quality, analysis: stored.resultJson as PhotoAnalysis, note: null, usage: noUsage(true) };
    }

    const cfg = readAiConfig(this.config);
    if (!cfg.apiKey) {
      return { mediaId: source.id, quality, analysis: null, note: 'AI analysis is not configured. The built-in quality check is shown.', usage: noUsage(false) };
    }
    const hint = `sharpness ${metrics.sharpness.toFixed(0)}, brightness ${metrics.brightness.toFixed(0)}, overall score ${quality.score}, issues: ${quality.problems.join(', ') || 'none'}`;
    const result = await this.photoAnalysis.analyse(this.claudeUrl(source), hint);
    if (!result) {
      return { mediaId: source.id, quality, analysis: null, note: 'The AI could not analyse this photo. The built-in quality check is shown.', usage: noUsage(false) };
    }
    await this.media.saveAnalysis(source.id, ANALYSIS_KIND, PHOTO_ANALYSIS_VERSION, result.analysis, result.usage);
    return { mediaId: source.id, quality, analysis: result.analysis, note: null, usage: { ...noUsage(false), claude: result.usage } };
  }

  private claudeUrl(asset: Asset): string {
    return asset.bytes > CLAUDE_MAX_BYTES ? asset.secureUrl.replace('/image/upload/', '/image/upload/c_limit,w_1600,q_auto:good,f_jpg/') : asset.secureUrl;
  }

  private processingKey(source: Asset, mode: string, format: InstagramFormat, category: ProductCategory): string {
    return createHash('sha256').update(JSON.stringify([source.sha256, mode, format, category, PIPELINE_VERSION])).digest('hex');
  }

  /** Stages B and E: built-in enhancement, no AI. The same photo with the same settings is returned from storage. */
  async enhance(userId: string, dto: EnhanceMediaDto) {
    const source = await this.source(await this.owned(userId, dto.mediaId));
    const format: InstagramFormat = dto.format ?? 'portrait';
    const stored = await this.cachedAnalysis(source.id);
    const category = this.categoryFor(dto.category, (stored?.resultJson as PhotoAnalysis | undefined) ?? null);
    const key = this.processingKey(source, dto.mode, format, category);

    const existing = await this.media.findVariant(source.id, key);
    if (existing) return this.result(source, existing as Asset, noUsage(true), [], null);

    const original = await this.download(source.secureUrl);
    const metrics = await measure(original);
    const quality = this.qualityView(metrics);
    if (quality.verdict === 'reupload') {
      throw new UnprocessableEntityException({ message: 'This photo needs to be retaken. Enhancing it would not give a good result.', problems: quality.messages });
    }

    const started = Date.now();
    const profile = profileFor(category).profile;
    let { buffer, report } = await enhance(original, metrics, { profile, format, cleanBackground: dto.mode === 'clean' });
    const sharpMs = Date.now() - started;
    const { crop, extended } = report;
    const blankShare = Math.max((extended.left + extended.right) / crop.width, (extended.top + extended.bottom) / crop.height);
    const notes: string[] = [];
    if (metrics.product.touchesEdges.length > 0 && blankShare > MAX_BLANK_SHARE) {
      // Cropping would cut the product or leave empty canvas, so keep the whole photo over a blurred backdrop.
      ({ buffer, report } = await enhance(original, metrics, { profile, format, cleanBackground: dto.mode === 'clean', blurFit: true }));
      notes.push('The product touches the edge of this photo, so the whole photo was kept and the extra space was filled with a soft blur.');
    }
    const warnings = [...notes, ...(report.backgroundSkippedReason ? [report.backgroundSkippedReason] : [])];

    const variant = await this.store(source, buffer, 'enhanced', key, { mode: dto.mode, format, category, version: PIPELINE_VERSION, report, qualityBefore: quality.score }, original, format, warnings);
    return this.result(source, variant.asset, { ...noUsage(false), sharpMs }, variant.warnings, quality);
  }

  /**
   * Stage D. Only runs with an external editor (Gemini) that was explicitly configured and only when the owner asks.
   * The same photo + style + model + instructions is returned from storage, so a background is never paid for twice.
   */
  async aiEdit(userId: string, dto: AiEditMediaDto) {
    const provider = this.editors.external();
    if (!provider) {
      throw new ServiceUnavailableException('AI photo editing is not set up for this app. Use Quick Enhance or Professional Background instead.');
    }
    const source = await this.source(await this.owned(userId, dto.mediaId));
    const stored = await this.cachedAnalysis(source.id);
    const analysis = (stored?.resultJson as PhotoAnalysis | undefined) ?? null;
    const style: VisualStyle = (dto.style as VisualStyle | undefined) ?? 'lighting_only';
    // Asking for a new scene is itself the explicit request; a plain lighting fix still needs the analysis to recommend it.
    if (style === 'lighting_only' && !dto.force && !analysis?.requiresAiEditing) {
      throw new UnprocessableEntityException('This photo does not need AI editing. Run /media/analyze first, pass force, or choose a background style.');
    }
    const format: InstagramFormat = dto.format ?? 'portrait';
    const category = this.categoryFor(dto.category, analysis);
    const model = provider.modelFor?.(dto.premium) ?? provider.name;
    const extra = dto.instructions ?? analysis?.editingInstructions ?? '';
    const key = this.processingKey(source, `ai:${provider.name}:${model}:${style}:${extra}`, format, category);
    const existing = await this.media.findVariant(source.id, key);
    if (existing) return this.result(source, existing as Asset, noUsage(true), [], null);

    const limit = provider.dailyLimitPerBusiness;
    const tracked = limit !== undefined;
    if (tracked) {
      const cost = provider.costFor?.(dto.premium) ?? 0;
      if (!(await this.usage.reserve(source.businessId, limit, { mediaId: source.id, model, style, costUsd: cost }))) {
        throw new HttpException(`Today's limit of ${limit} AI images has been reached. Use Quick Enhance or Professional Background, or try again tomorrow.`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const original = await this.download(source.secureUrl);
    const metrics = await measure(original);
    const instructions = provider.name === 'gemini' ? extra || null : [PRESERVE_PRODUCT_PROMPT, extra].filter(Boolean).join(' ');
    const started = Date.now();
    let edited: Awaited<ReturnType<typeof provider.edit>>;
    try {
      edited = await provider.edit({ original, metrics, category, format, instructions, style, premium: dto.premium });
    } catch (error) {
      if (tracked) await this.usage.settle(source.businessId, source.id, 'failed');
      throw error;
    }
    const sharpMs = Date.now() - started;

    let variant: Awaited<ReturnType<StudioService['store']>>;
    try {
      variant = await this.store(source, edited.buffer, 'ai_edited', key, { provider: provider.name, model: edited.model ?? model, style, premium: !!dto.premium, costUsd: edited.costUsd, format, category, report: edited.report }, original, format, [], style !== 'lighting_only');
    } catch (error) {
      if (tracked) await this.usage.settle(source.businessId, source.id, 'rejected');
      throw error;
    }
    if (tracked) await this.usage.settle(source.businessId, source.id, 'stored');
    return this.result(source, variant.asset, { ...noUsage(false), sharpMs, externalEditorUsd: edited.costUsd }, variant.warnings, null);
  }

  aiEditingAvailable(): boolean {
    return this.editors.external() !== null;
  }

  /**
   * A full-screen 9:16 AI background scene around the product, for Reels. Cached per business + photo + style + model,
   * so re-rendering a Reel never pays twice. Counts against the same daily AI allowance as photo edits.
   */
  async reelScene(businessId: string, image: Buffer, style: VisualStyle): Promise<Buffer> {
    const provider = this.editors.external();
    if (!provider) throw new ServiceUnavailableException('AI backgrounds are not set up for this app. Choose "Full photo" instead.');
    const model = provider.modelFor?.(false) ?? provider.name;
    const imageHash = createHash('sha256').update(image).digest('hex');
    const key = createHash('sha256').update(JSON.stringify([imageHash, style, model, REEL_SCENE_VERSION])).digest('hex');
    const cached = await this.usage.findScene(businessId, key);
    if (cached) return this.download(cached);

    const limit = provider.dailyLimitPerBusiness;
    const tracked = limit !== undefined;
    if (tracked && !(await this.usage.reserve(businessId, limit, { mediaId: `reel:${imageHash.slice(0, 16)}`, model, style, costUsd: provider.costFor?.(false) ?? 0 }))) {
      throw new HttpException(`Today's limit of ${limit} AI images has been reached. Choose "Full photo" or try again tomorrow.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const settle = (outcome: 'stored' | 'rejected' | 'failed') => (tracked ? this.usage.settle(businessId, `reel:${imageHash.slice(0, 16)}`, outcome) : Promise.resolve());
    // Gemini is not deterministic and sometimes makes a product greyer or warmer. A shop sells by colour, so the result is
    // measured: a noticeable drift gets one more try with a stronger colour instruction, and a clearly wrong colour is refused.
    const metrics = await measure(image);
    const hint = style === 'enhance' ? REEL_ENHANCE_HINT : REEL_SCENE_HINT;
    let buffer: Buffer | null = null;
    let check: Awaited<ReturnType<typeof checkOutput>> | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        ({ buffer } = await provider.edit({ original: image, metrics, category: 'general', format: 'story', instructions: attempt === 0 ? hint : `${hint} ${REEL_COLOUR_RETRY_HINT}`, style }));
      } catch (error) {
        await settle('failed');
        throw error;
      }
      check = await checkOutput(image, buffer, 'story', { sceneReplaced: true });
      if (check.errors.length || (check.colourShift ?? 0) <= REEL_COLOUR_RETRY_ABOVE) break;
      this.logger.warn({ event: 'reel_scene_colour_drift', attempt, shift: check.colourShift });
    }
    if (!buffer || !check) throw new UnprocessableEntityException('The AI background could not be made. Try again or choose "Full photo".');
    if (check.errors.length) {
      await settle('rejected');
      throw new UnprocessableEntityException('The AI background did not pass the quality checks. Try another look or "Full photo".');
    }
    if ((check.colourShift ?? 0) > REEL_COLOUR_REJECT_ABOVE) {
      await settle('rejected');
      throw new UnprocessableEntityException("The AI changed your product's colour, so it was not used. Try again, or choose \"Full photo\" to keep your photo exactly as it is.");
    }
    const stored = await this.cloudinary.upload(buffer, 'image/jpeg', `growpilot/${businessId}/reels`, 'ai-scene.jpg');
    await this.usage.saveScene(businessId, key, stored.secureUrl);
    await settle('stored');
    return buffer;
  }

  /** What AI image editing is available to this business and how much of today's allowance is left. */
  async aiUsage(userId: string) {
    const business = await this.businesses.findPrimaryForUser(userId);
    if (!business) throw new NotFoundException('Business not found');
    const provider = this.editors.external();
    const today = await this.usage.forDay(business.id);
    const limit = provider?.dailyLimitPerBusiness ?? null;
    return {
      available: provider !== null,
      provider: provider?.name ?? null,
      styles: VISUAL_STYLES,
      today: { date: today.date, used: today.count, limit, remaining: limit === null ? null : Math.max(0, limit - today.count), estimatedCostUsd: today.costUsd },
    };
  }

  /** Verifies the pixels, uploads, and records the new asset. A failed check stores nothing, so the original stays the fallback. */
  private async store(source: Asset, buffer: Buffer, variant: 'enhanced' | 'ai_edited', key: string, processing: Record<string, unknown>, original: Buffer, format: InstagramFormat, warnings: string[], sceneReplaced = false) {
    const check = await checkOutput(original, buffer, format, { sceneReplaced });
    if (check.errors.length) {
      this.logger.warn({ event: 'studio_output_rejected', mediaId: source.id, errors: check.errors });
      throw new UnprocessableEntityException({ message: 'The processed photo did not pass the quality checks, so your original was kept.', problems: check.errors });
    }
    const stored = await this.cloudinary.upload(buffer, 'image/jpeg', `growpilot/${source.businessId}/studio`, `${variant}.jpg`);
    try {
      const asset = await this.media.create(randomUUID(), {
        businessId: source.businessId,
        cloudinaryPublicId: stored.publicId,
        secureUrl: stored.secureUrl,
        mimeType: 'image/jpeg',
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        sourceAssetId: source.id,
        variant,
        processingKey: key,
        processingJson: { ...processing, warnings: [...warnings, ...check.warnings] },
      });
      return { asset: asset as Asset, warnings: [...warnings, ...check.warnings] };
    } catch (error) {
      // A parallel request stored the same result first.
      const winner = await this.media.findVariant(source.id, key);
      if (winner) return { asset: winner as Asset, warnings: [...warnings, ...check.warnings] };
      throw error;
    }
  }

  private result(source: Asset, variant: Asset, usage: UsageBreakdown, warnings: string[], quality: ReturnType<StudioService['qualityView']> | null) {
    return {
      original: this.view(source),
      result: this.view(variant),
      warnings,
      quality,
      requiresApproval: true,
      usage,
    };
  }

  /** Original, every processed version, and the stored analysis. Reading costs nothing. */
  async preview(userId: string, mediaId: string) {
    const source = await this.source(await this.owned(userId, mediaId));
    const variants = await this.media.listVariants(source.id);
    const stored = await this.cachedAnalysis(source.id);
    return {
      original: this.view(source),
      variants: (variants as Asset[]).map((v) => ({
        ...this.view(v),
        processing: v.processingJson ?? null,
      })),
      analysis: (stored?.resultJson as PhotoAnalysis | undefined) ?? null,
    };
  }

  /** The owner's explicit choice. Posts accept a processed photo only after this. Re-checks that the stored file is reachable and valid. */
  async approve(userId: string, mediaId: string) {
    const asset = await this.owned(userId, mediaId);
    if (asset.variant !== 'original') {
      const buffer = await this.download(asset.secureUrl);
      const source = await this.source(asset);
      const processing = (asset.processingJson ?? {}) as { format?: InstagramFormat };
      const check = await checkOutput(await this.download(source.secureUrl), buffer, processing.format ?? 'portrait');
      if (check.errors.length) {
        throw new UnprocessableEntityException({ message: 'This photo no longer passes the publishing checks.', problems: check.errors });
      }
    } else {
      await this.download(asset.secureUrl);
    }
    const at = new Date();
    await this.media.markApproved(asset.id, at);
    return { ...this.view({ ...asset, approvedAt: at } as Asset), approved: true };
  }
}
