import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    await this.prisma.checkConnection();

    return {
      status: 'ok',
      app: 'GrowPilot',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}