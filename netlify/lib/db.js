import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from './config.js';

let sql;

// El cliente HTTP puede reutilizarse sin mantener conexiones TCP abiertas.
export function query(text, parameters = []) {
  sql ??= neon(getDatabaseUrl());
  return sql.query(text, parameters, {
    fetchOptions: { signal: AbortSignal.timeout(5000) },
  });
}
