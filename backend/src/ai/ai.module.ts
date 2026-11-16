import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MediaModule } from '../media/media.module';
import { PostsModule } from '../posts/posts.module';
import { ProductsModule } from '../products/products.module';
import { AiController } from './ai.controller';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { BusinessContextService } from './business-context.service';
import { ClaudeProviderService } from './claude-provider.service';
import { ContentEditingService } from './content-editing.service';
import { ContentGenerationService } from './content-generation.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { GenerationCacheRepository } from './generation-cache.repository';
import { ImageAnalysisService } from './image-analysis.service';
import { IntentClassificationService } from './intent-classification.service';
import { ModelRouterService } from './model-router.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  imports: [AuthModule, BusinessModule, ProductsModule, ConversationsModule, PostsModule, MediaModule],
  controllers: [AiController],
  providers: [
    ModelRouterService,
    ClaudeProviderService,
    PromptBuilderService,
    BusinessContextService,
    ImageAnalysisService,
    IntentClassificationService,
    ContentGenerationService,
    ContentEditingService,
    ConversationSummaryService,
    GenerationCacheRepository,
    AiOrchestratorService,
  ],
  exports: [AiOrchestratorService, ClaudeProviderService, ImageAnalysisService],
})
export class AiModule {}
