#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/573d2e530c508e111547514f39880c52a28acf19f83511caa44965ba3e916b98/contract';
import endContract from '../../snapshots/573d2e530c508e111547514f39880c52a28acf19f83511caa44965ba3e916b98/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/db7723319eba602853a09ca5ae75adcfb32ad86622f4a6a95f2f29ba78b23d1c/contract';
import startContract from '../../snapshots/db7723319eba602853a09ca5ae75adcfb32ad86622f4a6a95f2f29ba78b23d1c/contract.json' with { type: 'json' };
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
        table: 'business_preferences',
        columns: [
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('caption_length', 'text', {
            notNull: true,
            default: lit('medium'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('hashtag_preference', 'text', {
            notNull: true,
            default: lit('few'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('poster_style', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('preferred_cta', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'business_preferences_caption_length_check_26312363',
            sql`"caption_length" IN ('short', 'medium', 'long')`,
          ),
          checkExpression(
            'business_preferences_hashtag_preference_check_62eea05c',
            sql`"hashtag_preference" IN ('none', 'few', 'moderate', 'many')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'conversation_messages',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('conversation_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('language', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'conversation_messages_language_check_6bb0b07e',
            sql`"language" IN ('hi', 'mr', 'en')`,
          ),
          checkExpression(
            'conversation_messages_role_check_bc5dc231',
            sql`"role" IN ('user', 'assistant', 'system')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'conversations',
        columns: [
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'conversations_status_check_de0835fb',
            sql`"status" IN ('active', 'closed')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'generated_posts',
        columns: [
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('call_to_action', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('caption', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('conversation_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('hashtags', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('headline', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instagram_media_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('language', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('original_image_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('poster_image_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('product_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('published_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'generated_posts_language_check_6bb0b07e',
            sql`"language" IN ('hi', 'mr', 'en')`,
          ),
          checkExpression(
            'generated_posts_status_check_953071ff',
            sql`"status" IN ('DRAFT', 'CONTENT_GENERATED', 'PREVIEW_READY', 'USER_APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'products',
        columns: [
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('category', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('currency', 'text', {
            notNull: true,
            default: lit('INR'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('image_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('is_available', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('price', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'businesses',
        column: col('brand_tone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'businesses',
        column: col('supported_languages', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'businesses',
        column: col('target_audience', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'business_preferences',
        constraint: 'business_preferences_business_id_key',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'conversation_messages',
        index: 'conversation_messages_conversation_id_created_at_idx_13048a6f',
        columns: ['conversation_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'conversation_messages',
        index: 'conversation_messages_conversation_id_idx_0c3639df',
        columns: ['conversation_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'conversations',
        index: 'conversations_business_id_created_at_idx_a4cd269c',
        columns: ['business_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'conversations',
        index: 'conversations_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'conversations',
        index: 'conversations_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'generated_posts',
        index: 'generated_posts_business_id_created_at_idx_a4cd269c',
        columns: ['business_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'generated_posts',
        index: 'generated_posts_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'generated_posts',
        index: 'generated_posts_conversation_id_idx_0c3639df',
        columns: ['conversation_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'generated_posts',
        index: 'generated_posts_product_id_idx_22a2b7d2',
        columns: ['product_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'products',
        index: 'products_business_id_created_at_idx_a4cd269c',
        columns: ['business_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'products',
        index: 'products_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'business_preferences',
        foreignKey: {
          name: 'business_preferences_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'conversation_messages',
        foreignKey: {
          name: 'conversation_messages_conversation_id_fkey',
          columns: ['conversation_id'],
          references: { schema: 'public', table: 'conversations', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'conversations',
        foreignKey: {
          name: 'conversations_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'conversations',
        foreignKey: {
          name: 'conversations_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'generated_posts',
        foreignKey: {
          name: 'generated_posts_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'generated_posts',
        foreignKey: {
          name: 'generated_posts_conversation_id_fkey',
          columns: ['conversation_id'],
          references: { schema: 'public', table: 'conversations', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'generated_posts',
        foreignKey: {
          name: 'generated_posts_product_id_fkey',
          columns: ['product_id'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'products',
        foreignKey: {
          name: 'products_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
