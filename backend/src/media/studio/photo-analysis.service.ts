import { Injectable, Logger } from '@nestjs/common';
import { ClaudeProviderService, AiOutputInvalidError } from '../../ai/claude-provider.service';
import { z } from 'zod';

const PhotoAnalysisSchema = z.object({
  productCategory: z.string(),
  productDescription: z.string(),
  imageQuality: z.object({
    score: z.number(),
    blur: z.string(),
    lighting: z.string(),
    background: z.string(),
    framing: z.string(),
  }),
  recommendedActions: z.array(z.string()),
  requiresAiEditing: z.boolean(),
  editingInstructions: z.string().nullable(),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>;

export const PHOTO_ANALYSIS_VERSION = 'v1';

const SYSTEM = [
  'You assess a shop owner\'s product photo for Instagram. You only look and describe.',
  'You cannot edit images and you must never say or imply that you edited, changed or improved this image.',
  'Describe only what is visible. Do not invent brand names, materials, sizes, prices or features.',
  'productCategory must be one of: footwear, clothing, jewellery, food, beauty, accessories, home, general.',
  'imageQuality.score is 0 to 100. blur, lighting, background and framing are each one short factual phrase.',
  'recommendedActions are short steps such as "brighten lighting", "clean background", "crop closer", "reshoot".',
  'Set requiresAiEditing true only when ordinary brightness, colour, crop and background clean-up cannot fix the photo',
  '(for example heavy clutter behind the product or a badly lit scene). When true, editingInstructions is a short request',
  'for a separate image editor that keeps the product exactly as it is; otherwise it is null.',
].join(' ');

export interface PhotoAnalysisUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Stage C: Claude vision. Reads a photo and returns validated JSON. It never produces or changes an image. */
@Injectable()
export class PhotoAnalysisService {
  private readonly logger = new Logger(PhotoAnalysisService.name);

  constructor(private readonly provider: ClaudeProviderService) {}

  /** Returns null when Claude could not produce a valid answer; the caller continues without it. */
  async analyse(imageUrl: string, hint: string): Promise<{ analysis: PhotoAnalysis; usage: PhotoAnalysisUsage } | null> {
    let usage: PhotoAnalysisUsage | null = null;
    const run = () =>
      this.provider.parse({
        task: 'photo-analysis',
        system: SYSTEM,
        user: `Assess this product photo. Measured facts from our own checks (do not contradict them): ${hint}`,
        images: [{ type: 'url', url: imageUrl }],
        schema: PhotoAnalysisSchema,
        onUsage: (u) => {
          usage = { model: u.model, inputTokens: (usage?.inputTokens ?? 0) + u.inputTokens, outputTokens: (usage?.outputTokens ?? 0) + u.outputTokens };
        },
      });
    try {
      const analysis = await run().catch((error: unknown) => {
        if (error instanceof AiOutputInvalidError) return run();
        throw error;
      });
      return usage ? { analysis, usage } : { analysis, usage: { model: 'unknown', inputTokens: 0, outputTokens: 0 } };
    } catch (error) {
      if (error instanceof AiOutputInvalidError) {
        this.logger.warn({ event: 'photo_analysis_invalid' });
        return null;
      }
      throw error;
    }
  }
}
