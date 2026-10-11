// web/e2e/db.ts
// Test-only: edits the disposable server's SQLite file, like qa/now_ui_check.py:96-99. Never production data.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PYTHON } from './server';

export function runSql(dataDir: string, statement: string, params: (string | number)[] = []): void {
  execFileSync(PYTHON, [
    '-c', 'import sqlite3, sys\nc = sqlite3.connect(sys.argv[1])\nc.execute(sys.argv[2], sys.argv[3:])\nc.commit()',
    join(dataDir, 'noema.sqlite3'), statement, ...params.map(String),
  ]);
}
