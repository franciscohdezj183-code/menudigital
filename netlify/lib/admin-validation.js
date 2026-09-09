import { AuthError, authFailure, checkSameOrigin, header } from './auth.js';
import { json } from './response.js';

export class AdminError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export const validId = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;

export function queryId(event, name) {
  if ((event.multiValueQueryStringParameters?.[name]?.length ?? 1) !== 1) return null;
  const value = event.queryStringParameters?.[name];
  return validId(value) ? value : null;
}

export function readJson(event, allowed, required = [], env = process.env) {
  checkSameOrigin(event, env);
  if (typeof event.body === 'string' && Buffer.byteLength(event.body) > 16384) throw new AdminError(413, 'PAYLOAD_TOO_LARGE');
  if (!header(event, 'content-type')?.toLowerCase().startsWith('application/json') || event.isBase64Encoded || typeof event.body !== 'string') throw new AdminError(400, 'VALIDATION_ERROR');
  let body;
  try { body = JSON.parse(event.body); } catch { throw new AdminError(400, 'VALIDATION_ERROR'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new AdminError(400, 'VALIDATION_ERROR');
  const keys = Object.keys(body);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !keys.includes(key))) throw new AdminError(400, 'VALIDATION_ERROR');
  return body;
}

export function text(value, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && [...normalized].length <= max ? normalized : undefined;
}

export function description(value) {
  if (value === null || value === '') return null;
  return typeof value === 'string' && [...value].length <= 1000 && !value.includes('\0') ? value.trim() || null : undefined;
}

export function price(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

export const boolean = value => typeof value === 'boolean' ? value : undefined;

export function idList(value) {
  return Array.isArray(value) && value.length <= 1000 && new Set(value).size === value.length && value.every(validId) ? value : null;
}

export function adminFailure(error, context, log) {
  if (error instanceof AdminError || error instanceof AuthError) return json({ ok: false, error: error.code }, error.status);
  log(context, error);
  return json({ ok: false, error: 'UNAVAILABLE' }, 503);
}
