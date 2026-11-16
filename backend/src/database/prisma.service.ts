import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import type { Contract } from '../../prisma/schema.d';
import contractJson = require('../../prisma/schema.json');

const contract = contractFromJson<Contract>(contractJson);

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db;

  constructor(configService: ConfigService) {
    this.db = postgres({
      contract,
      url: configService.getOrThrow<string>('DATABASE_URL'),
    });
  }

  async onModuleInit() {
    await this.checkConnection();
  }

  async checkConnection() {
    const plan = this.db.raw.sql`SELECT 1 AS healthy`
      .returnsRow({ healthy: 'pg/int4@1' })
      .build();

    await this.db.query(plan);
  }

  async onModuleDestroy() {
    await this.db.close();
  }
}