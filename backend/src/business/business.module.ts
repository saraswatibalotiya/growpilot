import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessController } from './business.controller';
import { BusinessRepository } from './business.repository';
import { BusinessService } from './business.service';

@Module({
  imports: [AuthModule],
  controllers: [BusinessController],
  providers: [BusinessRepository, BusinessService],
  exports: [BusinessRepository, BusinessService],
})
export class BusinessModule {}
