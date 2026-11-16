import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { AuthModule } from '../../auth/auth.module';
import { BusinessModule } from '../../business/business.module';
import { MediaModule } from '../media.module';
import { ConfigService } from '@nestjs/config';
import { GeminiImageService } from './gemini-image.service';
import { GeminiUsageRepository } from './gemini-usage.repository';
import { EXTERNAL_IMAGE_EDITOR, ImageEditingRegistry } from './image-editing.provider';
import { PhotoAnalysisService } from './photo-analysis.service';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({
  imports: [AuthModule, BusinessModule, MediaModule, AiModule],
  controllers: [StudioController],
  providers: [
    PhotoAnalysisService,
    GeminiUsageRepository,
    {
      // Gemini is optional: without GEMINI_API_KEY no external editor exists and AI editing reports as unavailable.
      provide: EXTERNAL_IMAGE_EDITOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => (GeminiImageService.isConfigured(config) ? new GeminiImageService(config) : null),
    },
    ImageEditingRegistry,
    StudioService,
  ],
  exports: [StudioService],
})
export class StudioModule {}
