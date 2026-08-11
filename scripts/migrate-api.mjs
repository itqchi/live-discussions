import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const MIGRATIONS_DIRECTORY = resolve(process.cwd(), 'apps/api/migrations');
const MIGRATION_FILE_PATTERN = /^\d+_[a-z0-9_-]+\.sql$/i;
const MIGRATION_LOCK_ID = 7_341_591_801;

async function main() {
  const driver = (process.env['DATABASE_DRIVER'] ?? 'memory').trim();
  if (driver === 'memory') {
    console.log('DATABASE_DRIVER=memory; no PostgreSQL migrations to apply.');
    return;
  }
  if (driver !== 'postgres') {
    throw new Error(`Unsupported DATABASE_DRIVER: ${driver}`);
  }

  const connectionString = process.env['DATABASE_URL']?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres.');
  }

  const migrationFiles = (await readdir(MIGRATIONS_DIRECTORY))
    .filter((fileName) => MIGRATION_FILE_PATTERN.test(fileName))
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIRECTORY}.`);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const fileName of migrationFiles) {
      const sql = await readFile(resolve(MIGRATIONS_DIRECTORY, fileName), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query(
        'SELECT checksum FROM schema_migration WHERE name = $1',
        [fileName],
      );

      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== checksum) {
          throw new Error(
            `Migration ${fileName} was already applied with a different checksum. `
            + 'Create a new migration instead of editing applied migrations.',
          );
        }
        console.log(`✓ ${fileName} already applied`);
        continue;
      }

      console.log(`→ Applying ${fileName}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)',
          [fileName, checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.log(`✓ Applied ${fileName}`);
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } finally {
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
