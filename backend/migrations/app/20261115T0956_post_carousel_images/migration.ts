#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/32e1cf79db8ffe75ff0c3c06e6d7e5cf50009b47408798d959d29cd0b8ce735f/contract';
import startContract from '../../snapshots/32e1cf79db8ffe75ff0c3c06e6d7e5cf50009b47408798d959d29cd0b8ce735f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9f4234c57f4938826929ae884692c457f32ae0df801070293a5fe45cfe6b125f/contract';
import endContract from '../../snapshots/9f4234c57f4938826929ae884692c457f32ae0df801070293a5fe45cfe6b125f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'post_images',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('image_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('post_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'post_images',
        constraint: 'post_images_post_id_position_key',
        columns: ['post_id', 'position'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'post_images',
        index: 'post_images_post_id_idx_865a6df2',
        columns: ['post_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'post_images',
        foreignKey: {
          name: 'post_images_post_id_fkey',
          columns: ['post_id'],
          references: { schema: 'public', table: 'generated_posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
