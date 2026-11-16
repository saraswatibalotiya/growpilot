import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstagramController } from './instagram.controller';
import { InstagramGraphClient } from './instagram-graph.client';
import { InstagramStateService } from './instagram-state.service';
import { InstagramRepository } from './instagram.repository';
import { InstagramSyncQueue } from './instagram-sync.queue';
import { InstagramSyncRepository } from './instagram-sync.repository';
import { InstagramSyncService } from './instagram-sync.service';
import { InstagramSyncWorker } from './instagram-sync.worker';
import { InstagramService } from './instagram.service';
import { OAuthNonceStore, RedisOAuthNonceStore } from './oauth-nonce.store';
import { TokenEncryptionService } from './token-encryption.service';

@Module({
  imports: [AuthModule],
  controllers: [InstagramController],
  providers: [
    InstagramGraphClient,
    InstagramStateService,
    InstagramRepository,
    InstagramService,
    InstagramSyncRepository,
    InstagramSyncQueue,
    InstagramSyncService,
    InstagramSyncWorker,
    TokenEncryptionService,
    { provide: OAuthNonceStore, useClass: RedisOAuthNonceStore },
  ],
  exports: [InstagramService, InstagramGraphClient, InstagramRepository, InstagramSyncService],
})
export class InstagramModule {}
