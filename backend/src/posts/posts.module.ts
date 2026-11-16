import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { InstagramModule } from '../instagram/instagram.module';
import { MediaModule } from '../media/media.module';
import { ProductsModule } from '../products/products.module';
import { PostsController } from './posts.controller';
import { PostsRepository } from './posts.repository';
import { PostsService } from './posts.service';

@Module({
  imports: [AuthModule, BusinessModule, ProductsModule, ConversationsModule, MediaModule, InstagramModule],
  controllers: [PostsController],
  providers: [PostsRepository, PostsService],
  exports: [PostsService, PostsRepository],
})
export class PostsModule {}
