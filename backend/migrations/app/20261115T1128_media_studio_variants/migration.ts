#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3819f6daa1a3835d5f1819b6541aebf79e09e2da29a3ee5e560036b07e69e16c/contract';
import endContract from '../../snapshots/3819f6daa1a3835d5f1819b6541aebf79e09e2da29a3ee5e560036b07e69e16c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e01fc3ce4b44e0a28fdfff797bf686861a60c53f255d7c381fc508435880d5d8/contract';
import startContract from '../../snapshots/e01fc3ce4b44e0a28fdfff797bf686861a60c53f255d7c381fc508435880d5d8/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'media_analyses',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('media_asset_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('result_json', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('usage_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('version', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'media_assets',
        column: col('approved_at', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'media_assets',
        column: col('processing_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'media_assets',
        column: col('processing_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'media_assets',
        column: col('source_asset_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'media_assets',
        column: col('variant', 'text', {
          notNull: true,
          default: lit('original'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'media_analyses',
        constraint: 'media_analyses_media_asset_id_kind_version_key',
        columns: ['media_asset_id', 'kind', 'version'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'media_assets',
        constraint: 'media_assets_variant_check_35eb1c06',
        expression: sql`"variant" IN ('original', 'enhanced', 'ai_edited')`,
      }),
      this.addUnique({
        schema: 'public',
        table: 'media_assets',
        constraint: 'media_assets_source_asset_id_processing_key_key',
        columns: ['source_asset_id', 'processing_key'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'media_analyses',
        index: 'media_analyses_media_asset_id_idx_8cdca53d',
        columns: ['media_asset_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'media_assets',
        index: 'media_assets_source_asset_id_idx_70638d00',
        columns: ['source_asset_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'media_analyses',
        foreignKey: {
          name: 'media_analyses_media_asset_id_fkey',
          columns: ['media_asset_id'],
          references: { schema: 'public', table: 'media_assets', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'media_assets',
        foreignKey: {
          name: 'media_assets_source_asset_id_fkey',
          columns: ['source_asset_id'],
          references: { schema: 'public', table: 'media_assets', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
