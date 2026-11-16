#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/32b08b5ded1a2e28d70a6a9829f3cd86715face63ed466b959d65eb2c11a1b26/contract';
import endContract from '../../snapshots/32b08b5ded1a2e28d70a6a9829f3cd86715face63ed466b959d65eb2c11a1b26/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6030d87e08603375fc4dcf469f8d9d293890b87bd3df67cd25804d9a383d655d/contract';
import startContract from '../../snapshots/6030d87e08603375fc4dcf469f8d9d293890b87bd3df67cd25804d9a383d655d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('look', 'text', {
          notNull: true,
          default: lit('FULL_PHOTO'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
