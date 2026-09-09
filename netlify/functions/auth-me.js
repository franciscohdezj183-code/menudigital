import { query } from '../lib/db.js';
import { json } from '../lib/response.js';
import { logServerError } from '../lib/errors.js';
import { requireOwner, publicIdentity, authFailure } from '../lib/auth.js';
export function createMeHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    try { return json({ ok: true, ...publicIdentity(await requireOwner(event, runQuery, env)) }); }
    catch (error) { return authFailure(error, 'auth.me', log); }
  };
}
export const handler = createMeHandler();
