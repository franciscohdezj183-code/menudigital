import { SignJWT, jwtVerify } from 'jose';
import { query } from './db.js';
import { json } from './response.js';
import { logServerError } from './errors.js';
import { getPublicSiteUrl, isLocalSiteUrl } from './config.js';
export const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE = 'menu_session';
const ISSUER = 'digital-menu';
const AUDIENCE = 'owner-panel';
export class AuthError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export function authKey(env = process.env) {
  if (typeof env.AUTH_SECRET !== 'string' || env.AUTH_SECRET.trim().length < 32) throw new Error('Configuración de autenticación inválida.');
  return new TextEncoder().encode(env.AUTH_SECRET);
}
export function sessionCookie(token, env = process.env, expired = false) {
  // Todo despliegue Netlify usa HTTPS; solo el desarrollo local permite HTTP.
  const secure = env.NODE_ENV !== 'development' || (env.CONTEXT && env.CONTEXT !== 'dev');
  return `${COOKIE}=${expired ? '' : token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${expired ? 0 : SESSION_SECONDS}${expired ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : ''}${secure ? '; Secure' : ''}`;
}
export function header(event, name) {
  return Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}
export function readSession(event) {
  const values = (header(event, 'cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
  return values.length === 1 ? values[0].slice(COOKIE.length + 1) : null;
}
export function checkSameOrigin(event, env = process.env) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(event.httpMethod)) return;
  if (header(event, 'sec-fetch-site') === 'cross-site') throw new AuthError(403, 'FORBIDDEN');
  const development = env.NODE_ENV === 'development' && env.CONTEXT !== 'production';
  const supplied = header(event, 'origin') || header(event, 'referer');
  if (!supplied) {
    if (development) return;
    throw new AuthError(403, 'FORBIDDEN');
  }
  let origin;
  try { origin = new URL(supplied).origin; } catch { throw new AuthError(403, 'FORBIDDEN'); }
  if (development) {
    if (isLocalSiteUrl(origin)) return;
    throw new AuthError(403, 'FORBIDDEN');
  }
  let configured;
  try { configured = new URL(getPublicSiteUrl(env)).origin; } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new Error('Configuración de origen inválida.');
  }
  if (origin !== configured) throw new AuthError(403, 'FORBIDDEN');
}
export async function signSession(user, env = process.env) {
  return new SignJWT({ business_id: user.business_id, role: user.role }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id).setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(authKey(env));
}
const validId = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
export async function verifySession(token, env = process.env) {
  const key = authKey(env);
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, typ: 'JWT', requiredClaims: ['sub', 'business_id', 'role', 'iat', 'exp'], maxTokenAge: SESSION_SECONDS });
    if (!validId(payload.sub) || !validId(payload.business_id) || typeof payload.role !== 'string' || payload.exp - payload.iat > SESSION_SECONDS) throw new Error();
    return payload;
  } catch { throw new AuthError(401, 'UNAUTHORIZED'); }
}
export const publicIdentity = row => ({
  user: { id: row.id, name: row.name, email: row.email, role: row.role },
  business: { name: row.business_name, slug: row.slug, logo_url: row.logo_url, theme_color: row.theme_color },
});
export async function requireOwner(event, runQuery = query, env = process.env) {
  const token = readSession(event);
  if (!token) throw new AuthError(401, 'UNAUTHORIZED');
  const payload = await verifySession(token, env);
  const [row] = await runQuery(`
    SELECT u.id::text AS id, u.business_id::text AS business_id, u.name, u.email, u.role,
           u.active AS user_active, b.active AS business_active, b.name AS business_name, b.slug, b.logo_url, b.cover_url, b.theme_color
    FROM users u JOIN businesses b ON b.id = u.business_id WHERE u.id = $1
  `, [payload.sub]);
  if (!row || !row.user_active || !row.business_active || row.business_id !== payload.business_id) throw new AuthError(401, 'UNAUTHORIZED');
  if (row.role !== 'OWNER' || payload.role !== 'OWNER') throw new AuthError(403, 'FORBIDDEN');
  return row;
}
export function authFailure(error, context, log = logServerError) {
  if (error instanceof AuthError) return json({ ok: false, error: error.code }, error.status);
  log(context, error);
  return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
}
