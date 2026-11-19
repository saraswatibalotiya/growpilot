import { HttpException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { formatPrice } from '../poster/poster-design';
import { CloudinaryClient } from '../media/cloudinary.client';
import { StudioService } from '../media/studio/studio.service';
import { ReelQualityError } from './composer/composer';
import { renderReelVideo } from './reel-video.renderer';
import { ReelScriptService } from './reel-script.service';
import { LOOK_STYLE, type ReelStage, type ReelStatus } from './reels.constants';
import { ReelsRepository, type ReelRecord } from './reels.repository';
import { ReelUserError } from './reel-user-error';

export interface PipelineOptions {
  /** Write a new script even if one exists. */
  rewriteScript?: boolean;
  /** With rewriteScript: ask for a clearly shorter one. */
  shorter?: boolean;
}

/** The reel was cancelled (or changed by someone else) while the job ran. */
class JobStopped extends Error {}

/**
 * Runs the Reel pipeline in this process: script text and video. Every step writes its real status and stage first,
 * and every write is conditional on the status the job believes the reel is in, so a cancel is noticed at the next step
 * and the job can never overwrite CANCELLED. READY is written in the same update that stores the video URL.
 */
@Injectable()
export class ReelPipelineService {
  private readonly logger = new Logger(ReelPipelineService.name);
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: ReelsRepository,
    private readonly scripts: ReelScriptService,
    private readonly cloudinary: CloudinaryClient,
    private readonly studio: StudioService,
  ) {}


  aiLooksAvailable(): boolean {
    return this.studio.aiEditingAvailable();
  }

  /** Overridable in tests. */
  renderVideo = renderReelVideo;

  isRunning(reelId: string): boolean {
    return this.running.has(reelId);
  }

  /** Resolves when every job started so far has finished. For tests. */
  async idle(): Promise<void> {
    await Promise.all(this.running.values());
  }

  /** Starts the job in the background and returns at once. */
  start(reelId: string, options: PipelineOptions = {}): void {
    const job = this.run(reelId, options)
      .catch((error: unknown) => this.logger.error({ event: 'reel_job_crashed', reelId, message: String((error as Error)?.message ?? error).slice(0, 500) }))
      .finally(() => this.running.delete(reelId));
    this.running.set(reelId, job);
  }

  private async run(reelId: string, options: PipelineOptions): Promise<void> {
    let status: ReelStatus = 'QUEUED';
    const move = async (to: ReelStatus, stage: ReelStage, extra: Parameters<ReelsRepository['updateIf']>[2] = {}): Promise<ReelRecord> => {
      const row = await this.repository.updateIf(reelId, status, { status: to, stage, error: null, ...extra });
      if (!row) throw new JobStopped();
      status = to;
      return row;
    };
    const assertActive = async () => {
      if ((await this.repository.findById(reelId))?.status !== status) throw new JobStopped();
    };

    try {
      let reel = (await this.repository.findById(reelId))!;
      const needScript = !!options.rewriteScript || !reel.script;
      let image: Buffer | null = null;

      if (needScript) {
        reel = await move('WRITING_SCRIPT', 'UNDERSTANDING');
        image = await this.loadImage(reel.sourceImageUrl);
        reel = await move('WRITING_SCRIPT', 'SCRIPT');
        const written = await this.scripts.write({
          language: reel.language,
          template: reel.template,
          tone: reel.tone,
          captionLength: reel.captionLength,
          hashtagLevel: reel.hashtagLevel,
          productName: reel.productName,
          price: reel.price,
          offerText: reel.offerText,
          businessName: reel.businessName,
          instruction: reel.instruction,
          duration: reel.durationSeconds,
          shorterThan: options.shorter ? reel.script : null,
        });
        reel = await this.repository.updateIf(reelId, status, { script: written.script, scenes: written.scenes, caption: written.caption, hashtags: written.hashtags, voiceStale: true, videoStale: true }).then((row) => row ?? this.stopped());
      }

      reel = await move('RENDERING', 'SCENES');
      image ??= await this.loadImage(reel.sourceImageUrl);
      // AI looks swap in a cached (or newly generated) full-screen scene around the same product.
      const look = reel.look ?? 'FULL_PHOTO';
      let plate = look !== 'FULL_PHOTO' && this.aiLooksAvailable();
      const style = LOOK_STYLE[look as keyof typeof LOOK_STYLE] ?? 'enhance';
      let extraImages: Buffer[] = [];
      for (const url of reel.extraImageUrls ?? []) {
        extraImages.push(await this.loadImage(url));
      }
      if (plate) {
        try {
          const enhancedExtras: Buffer[] = [];
          for (const extra of extraImages) {
            await assertActive();
            enhancedExtras.push(await this.studio.reelScene(reel.businessId, extra, style));
          }
          await assertActive();
          const enhancedImage = await this.studio.reelScene(reel.businessId, image, style);
          image = enhancedImage;
          extraImages = enhancedExtras;
        } catch (error) {
          if (error instanceof JobStopped) throw error;
          plate = false;
          this.logger.warn({ event: 'reel_enhance_skipped', reelId, reason: this.userMessage(error) });
        }
      }
      if (!plate && look !== 'FULL_PHOTO') {
        reel = await move('RENDERING', 'SCENES', { look: 'FULL_PHOTO' });
      }
      await assertActive();
      const rendered = await this.renderVideo({
        image,
        extraImages,
        template: reel.template,
        language: reel.language,
        scenes: reel.scenes ?? [],
        productName: reel.productName,
        priceText: formatPrice(reel.price),
        offerText: reel.template === 'SPECIAL_OFFER' ? reel.offerText : null,
        businessName: reel.businessName,
        duration: reel.durationSeconds,
        background: reel.backgroundStyle,
        animation: reel.animationLevel,
        textStyle: reel.textStyle,
        music: reel.music,
        plate,
        onStage: async (stage) => {
          if (stage === 'RENDERING') await move('RENDERING', 'RENDERING');
        },
      });
      await assertActive();
      const folder = `growpilot/${reel.businessId}/reels`;
      const video = await this.cloudinary.upload(rendered.video, 'video/mp4', folder, 'reel.mp4', 'video');
      const thumbnail = await this.cloudinary.upload(rendered.thumbnail, 'image/jpeg', folder, 'thumbnail.jpg');
      this.logger.log({ event: 'reel_quality', reelId, report: rendered.report });
      if (!(await this.repository.updateIf(reelId, status, { status: 'READY', stage: 'PREVIEW', videoUrl: video.secureUrl, thumbnailUrl: thumbnail.secureUrl, videoStale: false, voiceStale: false, renderReport: rendered.report, error: null }))) throw new JobStopped();
    } catch (error) {
      if (error instanceof JobStopped) {
        this.logger.log({ event: 'reel_job_stopped', reelId });
        return;
      }
      if (error instanceof ReelQualityError) this.logger.warn({ event: 'reel_quality_failed', reelId, report: error.report });
      this.logger.warn({ event: 'reel_job_failed', reelId, status, message: String((error as Error).message ?? error).slice(0, 500) });
      await this.repository.updateIf(reelId, status, { status: 'FAILED', error: this.userMessage(error) });
    }
  }

  private stopped(): never {
    throw new JobStopped();
  }

  private async loadImage(url: string): Promise<Buffer> {
    const buffer = await this.studio.download(url);
    try {
      await sharp(buffer, { failOn: 'error' }).metadata();
    } catch {
      throw new ReelUserError('The product photo could not be read. Please choose another photo.');
    }
    return buffer;
  }

  private userMessage(error: unknown): string {
    if (error instanceof ReelUserError) return error.message;
    if (error instanceof HttpException) return error.message;
    return 'The Reel could not be made. Please try again in a minute.';
  }
}
