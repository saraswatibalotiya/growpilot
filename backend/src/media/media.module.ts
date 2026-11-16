import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { CloudinaryClient } from './cloudinary.client';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [MediaController],
  providers: [CloudinaryClient, MediaRepository, MediaService],
  exports: [MediaRepository, CloudinaryClient],
})
export class MediaModule {}
