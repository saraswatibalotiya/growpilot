#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/bf0f944507e75ea6c80836ba06a9a3a3a46d0ecb08ab3344fad5001894ef8d8d/contract';
import startContract from '../../snapshots/bf0f944507e75ea6c80836ba06a9a3a3a46d0ecb08ab3344fad5001894ef8d8d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/db7723319eba602853a09ca5ae75adcfb32ad86622f4a6a95f2f29ba78b23d1c/contract';
import endContract from '../../snapshots/db7723319eba602853a09ca5ae75adcfb32ad86622f4a6a95f2f29ba78b23d1c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'media_assets',
        columns: [
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('bytes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('cloudinary_public_id', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('height', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('mime_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('secure_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sha256', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('width', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'media_assets',
        index: 'media_assets_business_id_created_at_idx_a4cd269c',
        columns: ['business_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'media_assets',
        index: 'media_assets_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'media_assets',
        foreignKey: {
          name: 'media_assets_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
