import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type Db = pg.Pool;

export function createPool(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

/** Apply schema.sql (idempotent). */
export async function migrate(db: Db): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // schema.sql sits next to the source file; dist keeps the same layout via the copy in build.
  const candidates = [
    path.join(here, 'schema.sql'),
    path.join(here, '..', '..', '..', 'src', 'db', 'schema.sql'),
  ];
  let sql: string | undefined;
  for (const c of candidates) {
    try { sql = await readFile(c, 'utf8'); break; } catch { /* try next */ }
  }
  if (!sql) throw new Error('schema.sql not found');
  await db.query(sql);
}
