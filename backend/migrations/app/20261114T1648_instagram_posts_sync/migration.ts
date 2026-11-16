#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/04b022dcc06f545882164feaaae9f623a3776326eb642d00dba1d42c639dd662/contract';
import endContract from '../../snapshots/04b022dcc06f545882164feaaae9f623a3776326eb642d00dba1d42c639dd662/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d74a50fb32778b130ba22f422634e954c99191e3c95302c3e4fd06e224a176d7/contract';
import startContract from '../../snapshots/d74a50fb32778b130ba22f422634e954c99191e3c95302c3e4fd06e224a176d7/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
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
        table: 'instagram_posts',
        columns: [
          col('caption', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deleted_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('last_seen_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('media_product_type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('media_type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('media_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('permalink', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('platform_media_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('published_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('social_account_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('thumbnail_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'post_metric_snapshots',
        columns: [
          col('captured_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('comments', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instagram_post_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('likes', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('profile_visits', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('reach', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('saves', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('shares', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('views', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'sync_runs',
        columns: [
          col('error_code', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('error_message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('finished_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('items_processed', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('social_account_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('started_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('queued'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'sync_runs_kind_check_62c9bd5d',
            sql`"kind" IN ('profile', 'media', 'metrics')`,
          ),
          checkExpression(
            'sync_runs_status_check_d0e38641',
            sql`"status" IN ('queued', 'running', 'succeeded', 'failed')`,
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('last_media_sync_at', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('live_publish_allowed', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('token_source', 'text', {
          notNull: true,
          default: lit('oauth'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'instagram_posts',
        constraint: 'instagram_posts_social_account_id_platform_media_id_key',
        columns: ['social_account_id', 'platform_media_id'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'social_accounts',
        constraint: 'social_accounts_token_source_check_7e89e9de',
        expression: sql`"token_source" IN ('oauth', 'dashboard')`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'instagram_posts',
        index: 'instagram_posts_social_account_id_idx_d0e0b0d0',
        columns: ['social_account_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'instagram_posts',
        index: 'instagram_posts_social_account_id_published_at_idx_52625efc',
        columns: ['social_account_id', 'published_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'post_metric_snapshots',
        index: 'idx_snapshots_post_captured',
        columns: ['instagram_post_id', 'captured_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'post_metric_snapshots',
        index: 'post_metric_snapshots_instagram_post_id_idx_ff0d6eb5',
        columns: ['instagram_post_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'sync_runs',
        index: 'sync_runs_social_account_id_idx_d0e0b0d0',
        columns: ['social_account_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'sync_runs',
        index: 'sync_runs_social_account_id_started_at_idx_f1278598',
        columns: ['social_account_id', 'started_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'instagram_posts',
        foreignKey: {
          name: 'instagram_posts_social_account_id_fkey',
          columns: ['social_account_id'],
          references: { schema: 'public', table: 'social_accounts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'post_metric_snapshots',
        foreignKey: {
          name: 'post_metric_snapshots_instagram_post_id_fkey',
          columns: ['instagram_post_id'],
          references: { schema: 'public', table: 'instagram_posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'sync_runs',
        foreignKey: {
          name: 'sync_runs_social_account_id_fkey',
          columns: ['social_account_id'],
          references: { schema: 'public', table: 'social_accounts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
