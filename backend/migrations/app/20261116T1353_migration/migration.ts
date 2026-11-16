#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/05cc7bfe1ae92c0569f921c0a8b00f2a8698c94a40f3ca313da7ad7ef65db408/contract';
import endContract from '../../snapshots/05cc7bfe1ae92c0569f921c0a8b00f2a8698c94a40f3ca313da7ad7ef65db408/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/297f4ed466c30e2fda09e1a2c378f03861235750a91fc1a5626f920017ea4b6e/contract';
import startContract from '../../snapshots/297f4ed466c30e2fda09e1a2c378f03861235750a91fc1a5626f920017ea4b6e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('extra_image_urls', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
