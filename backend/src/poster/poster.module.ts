import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { MediaModule } from '../media/media.module';
import { StudioModule } from '../media/studio/studio.module';
import { PostsModule } from '../posts/posts.module';
import { ProductsModule } from '../products/products.module';
import { PosterDesignService } from './poster-design.service';
import { PosterController } from './poster.controller';
import { PosterService } from './poster.service';

@Module({
  imports: [AuthModule, BusinessModule, MediaModule, StudioModule, AiModule, PostsModule, ProductsModule],
  controllers: [PosterController],
  providers: [PosterDesignService, PosterService],
})
export class PosterModule {}
