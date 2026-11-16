#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/d50a06b81d2835bb4dd961ef625c51ad9819ce9dd6c0614eba6fa6cad7779177/contract';
import endContract from '../../snapshots/d50a06b81d2835bb4dd961ef625c51ad9819ce9dd6c0614eba6fa6cad7779177/contract.json' with { type: 'json' };
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

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'audio_suggestions',
        columns: [
          col('category', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('external_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('mood', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('region', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', {
            notNull: true,
            default: lit('curated'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'auth_refresh_tokens',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expires_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revoked_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('token_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'businesses',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contact_method', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('location', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('primary_goal', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('website', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'campaign_assets',
        columns: [
          col('asset_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('campaign_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('edited_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metadata_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('original_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'campaign_assets_asset_type_check_662c71de',
            sql`"asset_type" IN ('image', 'video')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'campaign_metrics',
        columns: [
          col('campaign_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('clicks', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('comments', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('enquiries', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('impressions', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('likes', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('orders', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('profile_visits', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('reach', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('recorded_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('revenue', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('saves', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('shares', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('views', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'campaigns',
        columns: [
          col('audio_suggestion_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('caption', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('cta_text', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('goal', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('hashtags_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('platform_post_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('preview_payload_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('publish_error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('published_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('recommendation_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('draft'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'campaigns_status_check_b781fc31',
            sql`"status" IN ('draft', 'assets_uploaded', 'preview_ready', 'approved', 'publishing', 'published', 'failed')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'hashtag_templates',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('hashtags_json', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('location_required', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'leads',
        columns: [
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('campaign_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('contact', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('new'),
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
            'leads_status_check_a420b58b',
            sql`"status" IN ('new', 'contacted', 'qualified', 'converted', 'lost')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'orders',
        columns: [
          col('amount', 'numeric(12,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('campaign_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cost', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('gross_profit', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lead_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'presence_assessments',
        columns: [
          col('bio_complete', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contact_present', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('findings_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('follower_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('post_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('readiness_score', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('social_account_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'publish_logs',
        columns: [
          col('campaign_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('request_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('response_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'recommendations',
        columns: [
          col('action_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('bottleneck', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('confidence', 'numeric(4,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 4, scale: 2 } },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('payload_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('stage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('success_metrics_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'recommendations_status_check_c79ed209',
            sql`"status" IN ('active', 'accepted', 'dismissed', 'completed')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'social_accounts',
        columns: [
          col('access_token_encrypted', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('account_type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('business_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('follower_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('platform', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('platform_account_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('post_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('connected'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('token_expires_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('username', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'social_accounts_platform_check_b4b2d10a',
            sql`"platform" IN ('instagram')`,
          ),
          checkExpression(
            'social_accounts_status_check_952ae254',
            sql`"status" IN ('connected', 'expired', 'error', 'disconnected')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('password_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('users_status_check_39370351', sql`"status" IN ('active', 'disabled')`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audio_suggestions',
        index: 'audio_suggestions_category_idx_f2600f8e',
        columns: ['category'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audio_suggestions',
        index: 'audio_suggestions_region_idx_e321121b',
        columns: ['region'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auth_refresh_tokens',
        index: 'auth_refresh_tokens_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'businesses',
        index: 'businesses_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaign_assets',
        index: 'campaign_assets_campaign_id_idx_77cd6c37',
        columns: ['campaign_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaign_metrics',
        index: 'campaign_metrics_campaign_id_idx_77cd6c37',
        columns: ['campaign_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaign_metrics',
        index: 'campaign_metrics_recorded_at_idx_427d9bc9',
        columns: ['recorded_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaigns',
        index: 'campaigns_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaigns',
        index: 'campaigns_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'hashtag_templates',
        index: 'hashtag_templates_category_idx_f2600f8e',
        columns: ['category'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'leads',
        index: 'leads_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'leads',
        index: 'leads_campaign_id_idx_77cd6c37',
        columns: ['campaign_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_campaign_id_idx_77cd6c37',
        columns: ['campaign_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_lead_id_idx_cb1c5c02',
        columns: ['lead_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'presence_assessments',
        index: 'presence_assessments_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'presence_assessments',
        index: 'presence_assessments_social_account_id_idx_d0e0b0d0',
        columns: ['social_account_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'publish_logs',
        index: 'publish_logs_campaign_id_idx_77cd6c37',
        columns: ['campaign_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recommendations',
        index: 'recommendations_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'social_accounts',
        index: 'social_accounts_business_id_idx_23036de8',
        columns: ['business_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'social_accounts',
        index: 'social_accounts_platform_account_id_idx_fa2fda7d',
        columns: ['platform_account_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auth_refresh_tokens',
        foreignKey: {
          name: 'auth_refresh_tokens_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'businesses',
        foreignKey: {
          name: 'businesses_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campaign_assets',
        foreignKey: {
          name: 'campaign_assets_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'campaigns', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campaign_metrics',
        foreignKey: {
          name: 'campaign_metrics_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'campaigns', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campaigns',
        foreignKey: {
          name: 'campaigns_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'leads',
        foreignKey: {
          name: 'leads_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'leads',
        foreignKey: {
          name: 'leads_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'campaigns', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'orders',
        foreignKey: {
          name: 'orders_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'orders',
        foreignKey: {
          name: 'orders_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'campaigns', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'orders',
        foreignKey: {
          name: 'orders_lead_id_fkey',
          columns: ['lead_id'],
          references: { schema: 'public', table: 'leads', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'presence_assessments',
        foreignKey: {
          name: 'presence_assessments_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'presence_assessments',
        foreignKey: {
          name: 'presence_assessments_social_account_id_fkey',
          columns: ['social_account_id'],
          references: { schema: 'public', table: 'social_accounts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'publish_logs',
        foreignKey: {
          name: 'publish_logs_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'campaigns', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recommendations',
        foreignKey: {
          name: 'recommendations_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'social_accounts',
        foreignKey: {
          name: 'social_accounts_business_id_fkey',
          columns: ['business_id'],
          references: { schema: 'public', table: 'businesses', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
