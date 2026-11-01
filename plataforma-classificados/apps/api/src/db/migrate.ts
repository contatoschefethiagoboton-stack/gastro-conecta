/**
 * Executor de migrações SQL simples e idempotente.
 * Roda no Render como "Pre-Deploy Command": node dist/db/migrate.js
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool.js';

const dir = path.resolve(process.cwd(), 'db/migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)'); // evita duas instâncias migrando ao mesmo tempo
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      console.log(`[migrate] aplicando ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('[migrate] banco atualizado');
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] falhou', err);
  process.exit(1);
});
