import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { MediaModule } from './media/media.module';
import { StudioModule } from './media/studio/studio.module';
import { ProductsModule } from './products/products.module';
import { ConversationsModule } from './conversations/conversations.module';
import { PostsModule } from './posts/posts.module';
import { PosterModule } from './poster/poster.module';
import { ReelsModule } from './reels/reels.module';
import { PublishingModule } from './publishing/publishing.module';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { InstagramModule } from './instagram/instagram.module';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    BusinessModule,
    MediaModule,
    StudioModule,
    ProductsModule,
    ConversationsModule,
    PostsModule,
    PublishingModule,
    PosterModule,
    ReelsModule,
    AiModule,
    InstagramModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}