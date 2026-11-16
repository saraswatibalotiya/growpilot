import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstagramModule } from '../instagram/instagram.module';
import { MediaModule } from '../media/media.module';
import { PostsModule } from '../posts/posts.module';
import { PublishingController } from './publishing.controller';
import { PublishingService } from './publishing.service';

@Module({
  imports: [AuthModule, PostsModule, InstagramModule, MediaModule],
  controllers: [PublishingController],
  providers: [PublishingService],
  exports: [PublishingService],
})
export class PublishingModule {}
