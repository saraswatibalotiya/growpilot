#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9f4234c57f4938826929ae884692c457f32ae0df801070293a5fe45cfe6b125f/contract';
import startContract from '../../snapshots/9f4234c57f4938826929ae884692c457f32ae0df801070293a5fe45cfe6b125f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e01fc3ce4b44e0a28fdfff797bf686861a60c53f255d7c381fc508435880d5d8/contract';
import endContract from '../../snapshots/e01fc3ce4b44e0a28fdfff797bf686861a60c53f255d7c381fc508435880d5d8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'generation_cache',
        columns: [
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('cache_key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('response_json', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'generation_cache',
        constraint: 'generation_cache_business_id_cache_key_key',
        columns: ['business_id', 'cache_key'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'generation_cache',
        index: 'generation_cache_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'generation_cache',
        foreignKey: {
          name: 'generation_cache_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
