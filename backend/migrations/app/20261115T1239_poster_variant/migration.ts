#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3819f6daa1a3835d5f1819b6541aebf79e09e2da29a3ee5e560036b07e69e16c/contract';
import startContract from '../../snapshots/3819f6daa1a3835d5f1819b6541aebf79e09e2da29a3ee5e560036b07e69e16c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/98fe3e78ec36406dc93fe703f363677d3ba3f201d711d9e2766e21b51013948f/contract';
import endContract from '../../snapshots/98fe3e78ec36406dc93fe703f363677d3ba3f201d711d9e2766e21b51013948f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'media_assets',
        constraint: 'media_assets_variant_check_35eb1c06',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'media_assets',
        constraint: 'media_assets_variant_check_6105d31f',
        expression: sql`"variant" IN ('original', 'enhanced', 'ai_edited', 'poster')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
