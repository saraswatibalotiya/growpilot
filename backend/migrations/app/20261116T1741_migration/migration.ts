#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/51177e7c058429b24e821666cd06de7580829f1f453a6dca74a970eebbb59191/contract';
import endContract from '../../snapshots/51177e7c058429b24e821666cd06de7580829f1f453a6dca74a970eebbb59191/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6c9f5f98f9a6ef6f5cef458e7b4d9f2678d999699dbd8537341cd0dd4f293278/contract';
import startContract from '../../snapshots/6c9f5f98f9a6ef6f5cef458e7b4d9f2678d999699dbd8537341cd0dd4f293278/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'business_preferences' }),
      this.dropColumn({ schema: 'public', table: 'businesses', column: 'brand_tone' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
