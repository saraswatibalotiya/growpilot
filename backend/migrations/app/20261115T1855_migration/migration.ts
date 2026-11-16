#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6030d87e08603375fc4dcf469f8d9d293890b87bd3df67cd25804d9a383d655d/contract';
import endContract from '../../snapshots/6030d87e08603375fc4dcf469f8d9d293890b87bd3df67cd25804d9a383d655d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/98fe3e78ec36406dc93fe703f363677d3ba3f201d711d9e2766e21b51013948f/contract';
import startContract from '../../snapshots/98fe3e78ec36406dc93fe703f363677d3ba3f201d711d9e2766e21b51013948f/contract.json' with { type: 'json' };
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
        table: 'reels',
        columns: [
          col('approved_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('business_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('caption', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('duration_seconds', 'int4', {
            notNull: true,
            default: lit(10),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('hashtags', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instagram_media_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('instruction', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('language', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('media_asset_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('offer_text', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('permalink', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('price', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('product_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('product_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('publish_ambiguous', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('published_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('scenes', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('script', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('source_image_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('stage', 'text', {
            notNull: true,
            default: lit('UNDERSTANDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('template', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('thumbnail_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tone', 'text', {
            notNull: true,
            default: lit('elegant'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('video_stale', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('video_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('voice_stale', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('voice_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('reels_language_check_6bb0b07e', sql`"language" IN ('hi', 'mr', 'en')`),
          checkExpression(
            'reels_stage_check_448ddf6a',
            sql`"stage" IN ('UNDERSTANDING', 'SCRIPT', 'VOICEOVER', 'SCENES', 'RENDERING', 'PREVIEW')`,
          ),
          checkExpression(
            'reels_status_check_f1df3722',
            sql`"status" IN ('QUEUED', 'WRITING_SCRIPT', 'GENERATING_VOICE', 'RENDERING', 'READY', 'FAILED', 'CANCELLED', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED')`,
          ),
          checkExpression(
            'reels_template_check_4ef14015',
            sql`"template" IN ('SHOWCASE', 'NEW_ARRIVALS', 'SPECIAL_OFFER', 'MINIMAL_PREMIUM')`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reels',
        index: 'reels_business_id_created_at_idx_a4cd269c',
        columns: ['business_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reels',
        index: 'reels_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reels',
        index: 'reels_media_asset_id_idx_8cdca53d',
        columns: ['media_asset_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'reels',
        index: 'reels_product_id_idx_22a2b7d2',
        columns: ['product_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reels',
        foreignKey: {
          name: 'reels_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reels',
        foreignKey: {
          name: 'reels_product_id_fkey',
          columns: ['product_id'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reels',
        foreignKey: {
          name: 'reels_media_asset_id_fkey',
          columns: ['media_asset_id'],
          references: { schema: 'public', table: 'media_assets', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
