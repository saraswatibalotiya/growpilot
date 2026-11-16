#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/05cc7bfe1ae92c0569f921c0a8b00f2a8698c94a40f3ca313da7ad7ef65db408/contract';
import startContract from '../../snapshots/05cc7bfe1ae92c0569f921c0a8b00f2a8698c94a40f3ca313da7ad7ef65db408/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6c9f5f98f9a6ef6f5cef458e7b4d9f2678d999699dbd8537341cd0dd4f293278/contract';
import endContract from '../../snapshots/6c9f5f98f9a6ef6f5cef458e7b4d9f2678d999699dbd8537341cd0dd4f293278/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'leads' }),
      this.dropTable({ schema: 'public', table: 'presence_assessments' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
