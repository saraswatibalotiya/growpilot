import { Injectable, Optional, Inject } from '@nestjs/common';
import { type InstagramFormat, type ProductCategory, profileFor } from './enhance-profiles';
import type { ImageMetrics } from './image-quality';
import { enhance, type EnhanceReport } from './sharp-pipeline';

/** Sent with every request to an external image editor. The product is the one thing that must not change. */
export const PRESERVE_PRODUCT_PROMPT = [
  'Edit this product photo for Instagram. PRESERVE THE ACTUAL PRODUCT.',
  'Do not change the product shape, colour, design, stitching, straps, texture, logos, or count of items.',
  'Do not add, remove, redraw or invent any part of the product, and add no text, watermark, border or props.',
  'You may only improve lighting, balance the exposure, clean up the background and improve the framing.',
  'Keep the whole product visible and uncropped.',
].join(' ');

export interface ImageEditRequest {
  original: Buffer;
  metrics: ImageMetrics;
  category: ProductCategory;
  format: InstagramFormat;
  /** Extra guidance from the photo analysis. Never allowed to override the preservation rules. */
  instructions: string | null;
  /** Visual style for providers that can generate a new scene (see VISUAL_STYLES). Ignored by Sharp. */
  style?: VisualStyle;
  /** Ask for the provider's premium model, if it has one. */
  premium?: boolean;
}

export const VISUAL_STYLES = ['enhance', 'studio', 'lifestyle', 'luxury', 'festive', 'minimal', 'outdoor', 'lighting_only'] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export interface ImageEditResult {
  buffer: Buffer;
  provider: string;
  report: EnhanceReport | Record<string, unknown>;
  /** Provider charge for this edit, when the provider reports one. */
  costUsd: number | null;
  /** Model that produced the edit, when it was an AI model. */
  model?: string;
}

export interface ImageEditingProvider {
  readonly name: string;
  /** True when the image leaves our servers. */
  readonly external: boolean;
  /** AI edits allowed per business per UTC day. Undefined means unlimited. */
  readonly dailyLimitPerBusiness?: number;
  /** Model that would be used, for cache keys and usage records. */
  modelFor?(premium?: boolean): string;
  /** Estimated charge per edit, for usage records. */
  costFor?(premium?: boolean): number;
  edit(request: ImageEditRequest): Promise<ImageEditResult>;
}

/** The default editor: deterministic Sharp enhancement with background cleanup. No network, no cost. */
class SharpEditingProvider implements ImageEditingProvider {
  readonly name = 'sharp';
  readonly external = false;

  async edit(request: ImageEditRequest): Promise<ImageEditResult> {
    const { profile } = profileFor(request.category);
    const { buffer, report } = await enhance(request.original, request.metrics, { profile, format: request.format, cleanBackground: true });
    return { buffer, provider: this.name, report, costUsd: 0 };
  }
}

export const EXTERNAL_IMAGE_EDITOR = Symbol('EXTERNAL_IMAGE_EDITOR');

/**
 * Chooses the editor. An external AI editor is used only if one was explicitly provided; nothing is assumed
 * to be configured. Without one, `external()` is null and AI editing is reported as unavailable.
 */
@Injectable()
export class ImageEditingRegistry {
  private readonly sharpProvider = new SharpEditingProvider();

  constructor(@Optional() @Inject(EXTERNAL_IMAGE_EDITOR) private readonly externalProvider?: ImageEditingProvider | null) {}

  default(): ImageEditingProvider {
    return this.sharpProvider;
  }

  external(): ImageEditingProvider | null {
    return this.externalProvider ?? null;
  }
}
