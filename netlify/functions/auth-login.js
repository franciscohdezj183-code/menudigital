import { randomBytes } from 'node:crypto';
import { query } from '../lib/db.js';
import { json } from '../lib/response.js';
import { logServerError } from '../lib/errors.js';
import { normalizeEmail, validPasswordSize, comparePassword, hashPassword } from '../lib/passwords.js';
import { AuthError, authKey, signSession, sessionCookie, publicIdentity, authFailure, checkSameOrigin, header } from '../lib/auth.js';
import { clearLoginFailures, loginRateKeys, recordLoginFailure, requireLoginCapacity } from '../lib/login-rate-limit.js';
let dummyHash;
export function createLoginHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try {
      checkSameOrigin(event, env);
      if (typeof event.body === 'string' && Buffer.byteLength(event.body) > 4096) throw new AuthError(413, 'PAYLOAD_TOO_LARGE');
      if (!header(event, 'content-type')?.toLowerCase().startsWith('application/json') || event.isBase64Encoded || typeof event.body !== 'string') throw new AuthError(400, 'INVALID_REQUEST');
      let input;
      try { input = JSON.parse(event.body); } catch { throw new AuthError(400, 'INVALID_REQUEST'); }
      if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => !['email', 'password'].includes(key)) || Object.keys(input).length !== 2) throw new AuthError(400, 'INVALID_REQUEST');
      const email = normalizeEmail(input?.email);
      if (!email || !validPasswordSize(input?.password)) throw new AuthError(400, 'INVALID_REQUEST');
      authKey(env);
      const rateKeys = loginRateKeys(email, event, env);
      await requireLoginCapacity(runQuery, rateKeys);
      const rows = await runQuery(`
        SELECT u.id::text AS id, u.business_id::text AS business_id, u.name, u.email, u.role, u.password_hash,
               u.active AS user_active, b.active AS business_active, b.name AS business_name, b.slug, b.logo_url, b.theme_color
        FROM users u JOIN businesses b ON b.id = u.business_id WHERE lower(u.email) = $1 LIMIT 2
      `, [email]);
      const row = rows.length === 1 ? rows[0] : null;
      // Comparación costosa también cuando no hay usuario; el valor aleatorio nunca se registra.
      dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
      const correct = await comparePassword(input.password, row?.password_hash ?? await dummyHash);
      if (!row || !correct || !row.user_active || !row.business_active) {
        await recordLoginFailure(runQuery, rateKeys);
        throw new AuthError(401, 'INVALID_CREDENTIALS');
      }
      if (row.role !== 'OWNER') {
        await recordLoginFailure(runQuery, rateKeys);
        throw new AuthError(403, 'FORBIDDEN');
      }
      await clearLoginFailures(runQuery, rateKeys);
      const token = await signSession(row, env);
      return json({ ok: true, ...publicIdentity(row) }, 200, { 'Set-Cookie': sessionCookie(token, env) });
    } catch (error) { return authFailure(error, 'auth.login', log); }
  };
}
export const handler = createLoginHandler();
