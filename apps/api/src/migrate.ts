import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { pool } from './db.js';

const migrationLock = 823571;
const directory = new URL('../migrations/', import.meta.url);
const client = await pool.connect();

try {
  await client.query('select pg_advisory_lock($1)', [migrationLock]);
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
    const content = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const existing = await client.query('select checksum from schema_migrations where name = $1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }

    await client.query('begin');
    try {
      await client.query(content);
      await client.query('insert into schema_migrations(name, checksum) values ($1, $2)', [name, checksum]);
      await client.query('commit');
      console.log('Applied', name);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
} finally {
  try {
    await client.query('select pg_advisory_unlock($1)', [migrationLock]);
  } finally {
    client.release();
    await pool.end();
  }
}
