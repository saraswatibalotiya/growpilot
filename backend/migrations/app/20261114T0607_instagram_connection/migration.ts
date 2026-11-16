#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1b721cda7528069708f6bc6a7eddf43cd9a3b430505a25d0ce0c2c09a5b1e82d/contract';
import endContract from '../../snapshots/1b721cda7528069708f6bc6a7eddf43cd9a3b430505a25d0ce0c2c09a5b1e82d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a9bd3910755babd1cd12dbad1685f99a541344449f08177d412607237a36956c/contract';
import startContract from '../../snapshots/a9bd3910755babd1cd12dbad1685f99a541344449f08177d412607237a36956c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('display_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('facebook_page_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('is_mock', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('last_synced_at', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'social_accounts',
        column: col('permissions_json', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'social_accounts',
        constraint: 'social_accounts_platform_platform_account_id_key',
        columns: ['platform', 'platform_account_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
