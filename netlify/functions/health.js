import { query } from '../lib/db.js';
import { logServerError } from '../lib/errors.js';
import { HTTP, json } from '../lib/response.js';

export function createHealthHandler(runQuery = query, log = logServerError) {
  return async (event) => {
    if (event.httpMethod !== 'GET') {
      return json({ ok: false, error: 'Método no permitido.' }, HTTP.METHOD_NOT_ALLOWED, { Allow: 'GET' });
    }
    try {
      await runQuery('SELECT 1 AS connected', []);
      return json({ ok: true, service: 'digital-menu-api', database: 'connected' });
    } catch (error) {
      log('health.database', error);
      return json({ ok: false, service: 'digital-menu-api', database: 'unavailable' }, HTTP.UNAVAILABLE);
    }
  };
}

export const handler = createHealthHandler();
