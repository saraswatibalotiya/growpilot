#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/392ca356b109884718f3a13761e569f13662a5b596feffd33debb9b317765eba/contract';
import endContract from '../../snapshots/392ca356b109884718f3a13761e569f13662a5b596feffd33debb9b317765eba/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/51177e7c058429b24e821666cd06de7580829f1f453a6dca74a970eebbb59191/contract';
import startContract from '../../snapshots/51177e7c058429b24e821666cd06de7580829f1f453a6dca74a970eebbb59191/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropDefault({ schema: 'public', table: 'reels', column: 'tone' }),
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('caption_length', 'text', {
          notNull: true,
          default: lit('medium'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('hashtag_level', 'text', {
          notNull: true,
          default: lit('medium'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
