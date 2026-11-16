import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { FORMATS } from './enhance-profiles';
import { readGeminiConfig, type GeminiConfig } from './gemini.config';
import type { ImageEditingProvider, ImageEditRequest, ImageEditResult, VisualStyle } from './image-editing.provider';

/** Product-identity rules sent with every Gemini request. The scene may change; the product may not. */
export const GEMINI_PRESERVE_PROMPT = [
  'You are editing a real product photo for an Instagram advertisement.',
  'The product in the photo must stay EXACTLY the same: same shape, proportions, colours, packaging, labels, printed text, logos, materials, texture and number of items.',
  'Do not redraw, restyle, recolour, relabel or invent any part of the product. Do not add any text, prices, watermarks, borders or logos.',
  'Keep the whole product visible, uncropped and roughly centred, as the clear hero of the image.',
].join(' ');

const STYLE_PROMPTS: Record<VisualStyle, string> = {
  enhance: [
    'Do a simple, honest enhancement of this photo, not a new scene.',
    'Make the product FILL THE FRAME: reposition and crop away empty surroundings so the product is large and centred, covering about 80 to 84% of the frame width (or height, whichever is limiting), with an even margin of at least 8% on the left and right. No part of the product may touch or cross the frame edge.',
    'Gently improve the existing background only: remove clutter, stains and distractions, even out the lighting, and make it a clean, softly lit, plain surface in white or very light grey (or the original surface tidied up).',
    'Do NOT use beige, cream, tan or brown gradients, studio sets, props, patterns, bokeh or decorative effects.',
    'Keep one soft, natural contact shadow under the product. Lightly correct exposure and white balance.',
    'The product colour must stay EXACTLY as in the original photo: the same hue, saturation and warmth. Do not make it greyer, cooler, whiter, more yellow or more saturated.',
  ].join(' '),
  studio: 'Place the product on a clean, premium studio backdrop with a soft seamless gradient, gentle reflections and soft natural shadows under the product.',
  lifestyle: 'Place the product in a tasteful, realistic lifestyle scene that suits how it is used, with a softly blurred background (shallow depth of field).',
  luxury: 'Place the product in an elegant luxury setting: rich dark tones, marble or velvet surfaces, warm rim lighting and subtle golden highlights.',
  festive: 'Place the product in a warm festive Indian celebration setting with soft bokeh lights, marigold or diya accents kept in the background, never covering the product.',
  minimal: 'Place the product on a minimal pastel backdrop with simple geometric props in the background and soft diffused daylight.',
  outdoor: 'Place the product in a bright, natural outdoor setting with soft sunlight and a gently blurred background.',
  lighting_only: 'Keep the existing background and composition. Only improve lighting, exposure, shadows and colour balance, and remove distracting clutter.',
};

const ASPECT: Record<keyof typeof FORMATS, string> = { portrait: '4:5', square: '1:1', story: '9:16' };

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

export function buildGeminiPrompt(style: VisualStyle, extra: string | null): string {
  return [GEMINI_PRESERVE_PROMPT, STYLE_PROMPTS[style], extra ? `Additional guidance (never overrides the rules above): ${extra}` : ''].filter(Boolean).join('\n\n');
}

/** Pulls the first image out of a generateContent response. */
export function extractImage(body: GeminiResponse): Buffer | null {
  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const data = part.inlineData?.data ?? part.inline_data?.data;
      if (data) return Buffer.from(data, 'base64');
    }
  }
  return null;
}

/**
 * Optional AI visual enhancer backed by the Gemini image API. Only constructed when GEMINI_API_KEY is set,
 * only called when a user explicitly asks for an AI edit, and the result is cached per photo + style + model.
 */
@Injectable()
export class GeminiImageService implements ImageEditingProvider {
  readonly name = 'gemini';
  readonly external = true;
  private readonly logger = new Logger(GeminiImageService.name);
  private readonly cfg: GeminiConfig;

  constructor(config: ConfigService) {
    this.cfg = readGeminiConfig(config);
  }

  static isConfigured(config: ConfigService): boolean {
    return !!readGeminiConfig(config).apiKey;
  }

  get dailyLimitPerBusiness(): number {
    return this.cfg.dailyLimitPerBusiness;
  }

  modelFor(premium: boolean | undefined): string {
    return premium ? this.cfg.premiumModel : this.cfg.model;
  }

  costFor(premium: boolean | undefined): number {
    return premium ? this.cfg.premiumCostPerImageUsd : this.cfg.costPerImageUsd;
  }

  async edit(request: ImageEditRequest): Promise<ImageEditResult> {
    const style = request.style ?? 'studio';
    const model = this.modelFor(request.premium);
    const canvas = FORMATS[request.format];
    const input = await sharp(request.original).rotate().resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();

    const url = `${this.cfg.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.cfg.apiKey! },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildGeminiPrompt(style, request.instructions) }, { inline_data: { mime_type: 'image/jpeg', data: input.toString('base64') } }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ASPECT[request.format] } },
        }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (error) {
      this.logger.warn({ event: 'gemini_request_failed', model, message: String((error as Error)?.message ?? error).slice(0, 300) });
      throw new BadGatewayException('The AI image service did not respond. Please try again later.');
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      this.logger.warn({ event: 'gemini_http_error', model, status: response.status, detail });
      throw new BadGatewayException(response.status === 429 ? 'The AI image service is busy. Please try again in a few minutes.' : 'The AI image service could not edit this photo.');
    }
    const body = (await response.json()) as GeminiResponse;
    const image = extractImage(body);
    if (!image) {
      this.logger.warn({ event: 'gemini_no_image', model, blockReason: body.promptFeedback?.blockReason, finishReason: body.candidates?.[0]?.finishReason });
      throw new BadGatewayException('The AI image service did not return an image for this photo.');
    }

    // Gemini returns the requested aspect ratio, so "cover" only trims rounding differences to hit the exact Instagram size.
    const buffer = await sharp(image)
      .resize(canvas.width, canvas.height, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return {
      buffer,
      provider: this.name,
      model,
      costUsd: this.costFor(request.premium),
      report: { model, style, aspectRatio: ASPECT[request.format], ms: Date.now() - started },
    };
  }
}
