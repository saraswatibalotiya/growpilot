import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiEngineClient } from './ai-engine.client';
import { AiEngineController } from './ai-engine.controller';
import { AiEngineService } from './ai-engine.service';
import { AiEngineSourceRepository } from './ai-engine-source.repository';

/**
 * Optional connection to the internal Python AI engine. Off unless AI_ENGINE_ENABLED=true. Additive by design: no existing
 * module imports it, and with the engine off or down only the /ai-insights routes answer 503.
 */
@Module({
  imports: [AuthModule],
  controllers: [AiEngineController],
  providers: [AiEngineClient, AiEngineSourceRepository, AiEngineService],
})
export class AiEngineModule {}
