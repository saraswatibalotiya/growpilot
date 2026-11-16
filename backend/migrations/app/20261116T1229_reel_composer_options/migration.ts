#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/297f4ed466c30e2fda09e1a2c378f03861235750a91fc1a5626f920017ea4b6e/contract';
import endContract from '../../snapshots/297f4ed466c30e2fda09e1a2c378f03861235750a91fc1a5626f920017ea4b6e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/32b08b5ded1a2e28d70a6a9829f3cd86715face63ed466b959d65eb2c11a1b26/contract';
import startContract from '../../snapshots/32b08b5ded1a2e28d70a6a9829f3cd86715face63ed466b959d65eb2c11a1b26/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('animation_level', 'text', {
          notNull: true,
          default: lit('BALANCED'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('background_style', 'text', {
          notNull: true,
          default: lit('BEIGE_STUDIO'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('music', 'text', {
          notNull: true,
          default: lit('NONE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('render_report', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'reels',
        column: col('text_style', 'text', {
          notNull: true,
          default: lit('CLASSIC'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
