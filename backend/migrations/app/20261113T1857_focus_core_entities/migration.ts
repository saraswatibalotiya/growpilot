#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a9bd3910755babd1cd12dbad1685f99a541344449f08177d412607237a36956c/contract';
import endContract from '../../snapshots/a9bd3910755babd1cd12dbad1685f99a541344449f08177d412607237a36956c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d50a06b81d2835bb4dd961ef625c51ad9819ce9dd6c0614eba6fa6cad7779177/contract';
import startContract from '../../snapshots/d50a06b81d2835bb4dd961ef625c51ad9819ce9dd6c0614eba6fa6cad7779177/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'leads',
        constraint: 'leads_campaign_id_fkey',
        kind: 'foreignKey',
      }),
      this.dropTable({ schema: 'public', table: 'audio_suggestions' }),
      this.dropTable({ schema: 'public', table: 'auth_refresh_tokens' }),
      this.dropTable({ schema: 'public', table: 'campaign_assets' }),
      this.dropTable({ schema: 'public', table: 'campaign_metrics' }),
      this.dropTable({ schema: 'public', table: 'hashtag_templates' }),
      this.dropIndex({ schema: 'public', table: 'leads', index: 'leads_campaign_id_idx_77cd6c37' }),
      this.dropColumn({ schema: 'public', table: 'leads', column: 'campaign_id' }),
      this.dropTable({ schema: 'public', table: 'orders' }),
      this.dropTable({ schema: 'public', table: 'publish_logs' }),
      this.dropTable({ schema: 'public', table: 'campaigns' }),
      this.addColumn({
        schema: 'public',
        table: 'presence_assessments',
        column: col('comment_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'presence_assessments',
        column: col('like_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'presence_assessments',
        column: col('view_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
