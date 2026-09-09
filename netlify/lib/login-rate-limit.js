import { createHmac } from 'node:crypto';
import { AuthError, authKey, header } from './auth.js';

export const LOGIN_LIMIT = 8;
export const LOGIN_WINDOW_MINUTES = 15;

function digest(value, env) {
  return createHmac('sha256', authKey(env)).update(value).digest('hex');
}

function clientAddress(event) {
  const direct = header(event, 'x-nf-client-connection-ip');
  const forwarded = header(event, 'x-forwarded-for')?.split(',')[0]?.trim();
  const value = direct || forwarded;
  return typeof value === 'string' && value.length <= 64 && /^[0-9a-f:.]+$/i.test(value) ? value.toLowerCase() : null;
}

export function loginRateKeys(email, event, env = process.env) {
  const keys = [digest(`email:${email}`, env)];
  const address = clientAddress(event);
  if (address) keys.push(digest(`ip:${address}`, env));
  return keys;
}

export async function requireLoginCapacity(runQuery, keys) {
  const [state] = await runQuery(
    `WITH purged AS (
      DELETE FROM login_rate_limits WHERE updated_at < NOW() - INTERVAL '1 day' RETURNING key_hash
    )
    SELECT EXISTS (SELECT 1 FROM login_rate_limits WHERE key_hash = ANY($1::text[]) AND blocked_until > NOW()) AS limited`,
    [keys],
  );
  if (state?.limited) throw new AuthError(429, 'TOO_MANY_REQUESTS');
}

export async function recordLoginFailure(runQuery, keys) {
  const rows = await runQuery(`
    INSERT INTO login_rate_limits (key_hash, window_started_at, failed_attempts, blocked_until, updated_at)
    SELECT key_hash, NOW(), 1, NULL, NOW() FROM unnest($1::text[]) AS keys(key_hash)
    ON CONFLICT (key_hash) DO UPDATE SET
      failed_attempts = CASE
        WHEN login_rate_limits.window_started_at < NOW() - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes' THEN 1
        ELSE login_rate_limits.failed_attempts + 1
      END,
      window_started_at = CASE
        WHEN login_rate_limits.window_started_at < NOW() - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes' THEN NOW()
        ELSE login_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN login_rate_limits.window_started_at < NOW() - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes' THEN NULL
        WHEN login_rate_limits.failed_attempts + 1 >= ${LOGIN_LIMIT} THEN NOW() + INTERVAL '${LOGIN_WINDOW_MINUTES} minutes'
        ELSE login_rate_limits.blocked_until
      END,
      updated_at = NOW()
    RETURNING blocked_until > NOW() AS limited
  `, [keys]);
  if (rows.some(row => row.limited)) throw new AuthError(429, 'TOO_MANY_REQUESTS');
}

export async function clearLoginFailures(runQuery, keys) {
  await runQuery('DELETE FROM login_rate_limits WHERE key_hash = ANY($1::text[])', [keys]);
}
