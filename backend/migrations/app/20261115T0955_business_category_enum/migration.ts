#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/32e1cf79db8ffe75ff0c3c06e6d7e5cf50009b47408798d959d29cd0b8ce735f/contract';
import endContract from '../../snapshots/32e1cf79db8ffe75ff0c3c06e6d7e5cf50009b47408798d959d29cd0b8ce735f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/573d2e530c508e111547514f39880c52a28acf19f83511caa44965ba3e916b98/contract';
import startContract from '../../snapshots/573d2e530c508e111547514f39880c52a28acf19f83511caa44965ba3e916b98/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.setDefault({
        schema: 'public',
        table: 'businesses',
        column: col('category', 'text', {
          default: lit('other'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'businesses',
        constraint: 'businesses_category_check_06109f42',
        expression: sql`"category" IN ('clothing', 'jewellery', 'grocery', 'footwear', 'other')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
