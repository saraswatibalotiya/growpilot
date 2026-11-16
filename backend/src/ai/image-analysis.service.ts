import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaRepository } from '../media/media.repository';
import { readAiConfig } from './ai.config';
import { AiOutputInvalidError, ClaudeProviderService } from './claude-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ImageAnalysisSchema, type ImageAnalysis } from './schemas';

const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageAnalysisResult {
  analysis: ImageAnalysis | null;
  /** Set when the photo could not be analysed; content is still generated without it. */
  warning: string | null;
}

/**
 * Photo understanding with Claude vision. Claude fetches the image itself, so before any request the URL is
 * checked against our trusted storage and against the owner's own uploads. That blocks server-side request
 * forgery and prevents one shop from analysing another shop's photos.
 */
@Injectable()
export class ImageAnalysisService {
  private readonly logger = new Logger(ImageAnalysisService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly provider: ClaudeProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly media: MediaRepository,
  ) {}

  /** Throws a 400 with a clear message when the URL is not an acceptable image. Returns the URL when it is. */
  async validate(businessId: string, rawUrl: string): Promise<string> {
    const cfg = readAiConfig(this.config);
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('imageUrl is not a valid URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password) throw new BadRequestException('imageUrl must be a plain https URL');
    if (!cfg.trustedImageHosts.includes(url.hostname.toLowerCase())) {
      throw new BadRequestException('Use a photo uploaded through GrowPilot. Other image sources are not accepted.');
    }
    if (!cfg.cloudName) throw new ServiceUnavailableException('Image storage is not configured');
    if (!url.pathname.startsWith(`/${cfg.cloudName}/image/upload/`)) {
      throw new BadRequestException('Use a photo uploaded through GrowPilot. Other image sources are not accepted.');
    }

    // The strongest check: the URL must be a photo this shop uploaded. Upload already validated type and size.
    const asset = await this.media.findBySecureUrl(rawUrl);
    if (!asset || asset.businessId !== businessId) {
      throw new BadRequestException('That photo was not found in your uploads. Upload it first, then try again.');
    }
    if (!SUPPORTED.includes(asset.mimeType)) {
      throw new BadRequestException('This photo type cannot be analysed. Please use a JPEG, PNG or WEBP photo.');
    }
    if (asset.bytes > cfg.maxImageBytes) {
      throw new BadRequestException('This photo is too large to analyse. Please use one under 5 MB.');
    }
    return rawUrl;
  }

  async analyse(businessId: string, rawUrl: string): Promise<ImageAnalysisResult> {
    const url = await this.validate(businessId, rawUrl);
    const prompt = this.prompts.imageAnalysis();
    try {
      const analysis = await this.provider.parse({
        task: 'image-analysis',
        system: prompt.system,
        user: prompt.user,
        images: [{ type: 'url', url }],
        schema: ImageAnalysisSchema,
      });
      return { analysis, warning: null };
    } catch (error) {
      // The photo is optional context. If Claude can't fetch or read it, carry on without it, and say so.
      if (error instanceof AiOutputInvalidError || error instanceof BadGatewayException) {
        this.logger.warn({ event: 'image_analysis_skipped', reason: error.constructor.name });
        return { analysis: null, warning: 'The photo could not be analysed, so the content was written without it.' };
      }
      throw error;
    }
  }
}
