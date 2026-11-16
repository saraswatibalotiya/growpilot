#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/04b022dcc06f545882164feaaae9f623a3776326eb642d00dba1d42c639dd662/contract';
import startContract from '../../snapshots/04b022dcc06f545882164feaaae9f623a3776326eb642d00dba1d42c639dd662/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/bf0f944507e75ea6c80836ba06a9a3a3a46d0ecb08ab3344fad5001894ef8d8d/contract';
import endContract from '../../snapshots/bf0f944507e75ea6c80836ba06a9a3a3a46d0ecb08ab3344fad5001894ef8d8d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'businesses',
        column: col('area', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'businesses',
        column: col('city', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'businesses',
        column: col('preferred_language', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'businesses',
        constraint: 'businesses_preferred_language_check_f4e1a6aa',
        expression: sql`"preferred_language" IN ('hi', 'mr', 'en')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
