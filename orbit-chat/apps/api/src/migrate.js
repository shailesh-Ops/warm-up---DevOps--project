import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SQL_DIR = fileURLToPath(new URL('../sql/', import.meta.url));
const LOCK_ID = 727274; // arbitrary app-wide advisory lock so two API processes never migrate at once

/**
 * Applies every sql/NNN_*.sql file that has not been applied yet, in order.
 * Safe to run on every start: applied files are tracked in schema_migrations,
 * and the shipped SQL itself is idempotent (IF NOT EXISTS).
 * Returns the list of files applied during this call.
 */
export async function runMigrations(pool) {
  const files = (await readdir(SQL_DIR)).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map(r => r.name));
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(SQL_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`${file}: ${err.message}`);
      }
      applied.push(file);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}
