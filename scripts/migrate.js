import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { getDatabaseUrl } from '../netlify/lib/config.js';
import { logServerError } from '../netlify/lib/errors.js';

const directory = new URL('../database/migrations/', import.meta.url);

export async function migrate(client, migrationsDirectory = directory, log = console.log) {
  const filenames = (await readdir(migrationsDirectory)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!filenames.length) throw new Error('No se encontraron migraciones.');
  await client.query('BEGIN');
  try {
    // Un bloqueo transaccional serializa ejecuciones simultáneas, incluso con pooler.
    await client.query('SELECT pg_advisory_xact_lock(724019, 1)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
    const applied = new Map(rows.map((row) => [row.filename, row.checksum]));
    for (const name of applied.keys()) {
      if (!filenames.includes(name)) throw new Error('Falta una migración previamente aplicada.');
    }
    const executed = [];
    for (const filename of filenames) {
      const sql = await readFile(new URL(filename, migrationsDirectory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(filename)) {
        if (applied.get(filename) !== checksum) throw new Error(`Migración aplicada modificada: ${filename}`);
        continue;
      }
      if (rows.some((row) => row.filename > filename)) throw new Error(`Migración fuera de orden: ${filename}`);
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [filename, checksum]);
      } catch (error) {
        log(`Falló la migración ${filename}; se revertirá la transacción.`);
        throw error;
      }
      executed.push(filename);
    }
    await client.query('COMMIT');
    log(executed.length ? `Migraciones aplicadas: ${executed.join(', ')}` : 'Sin migraciones pendientes.');
    return executed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const connectionString = getDatabaseUrl();
  neonConfig.webSocketConstructor = ws;
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 60000 });
  try {
    await client.connect();
    await migrate(client);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    logServerError('migration', error);
    console.error('No se completaron las migraciones. Comprueba DATABASE_URL, TLS, conectividad y archivos SQL.');
    process.exitCode = 1;
  });
}
