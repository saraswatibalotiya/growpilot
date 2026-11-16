import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { MediaModule } from '../media/media.module';
import { StudioModule } from '../media/studio/studio.module';
import { ProductsModule } from '../products/products.module';
import { PublishingModule } from '../publishing/publishing.module';
import { ReelPipelineService } from './reel-pipeline.service';
import { ReelScriptService } from './reel-script.service';
import { ReelsController } from './reels.controller';
import { ReelsRepository } from './reels.repository';
import { ReelsService } from './reels.service';

@Module({
  imports: [AuthModule, BusinessModule, MediaModule, StudioModule, ProductsModule, AiModule, PublishingModule],
  controllers: [ReelsController],
  providers: [ReelsRepository, ReelScriptService, ReelPipelineService, ReelsService],
})
export class ReelsModule {}
