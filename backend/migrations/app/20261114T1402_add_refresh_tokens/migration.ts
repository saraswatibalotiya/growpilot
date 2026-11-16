#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1b721cda7528069708f6bc6a7eddf43cd9a3b430505a25d0ce0c2c09a5b1e82d/contract';
import startContract from '../../snapshots/1b721cda7528069708f6bc6a7eddf43cd9a3b430505a25d0ce0c2c09a5b1e82d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d74a50fb32778b130ba22f422634e954c99191e3c95302c3e4fd06e224a176d7/contract';
import endContract from '../../snapshots/d74a50fb32778b130ba22f422634e954c99191e3c95302c3e4fd06e224a176d7/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
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
          col('family_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revoked_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('token_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'auth_refresh_tokens',
        constraint: 'auth_refresh_tokens_token_hash_key',
        columns: ['token_hash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auth_refresh_tokens',
        index: 'auth_refresh_tokens_family_id_idx_027b534e',
        columns: ['family_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auth_refresh_tokens',
        index: 'auth_refresh_tokens_user_id_idx_6c952402',
        columns: ['user_id'],
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
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
