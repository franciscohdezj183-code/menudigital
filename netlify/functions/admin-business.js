import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, readJson, text, description } from '../lib/admin-validation.js';

const fields = 'id::text AS id, name, slug, logo_url, cover_url, description, address, phone, theme_color';
const optional = (value, max) => value === null || value === '' ? null : text(value, max);
export function createAdminBusinessHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (!['GET', 'PATCH'].includes(event.httpMethod)) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, PATCH' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      if (event.httpMethod === 'GET') {
        const [business] = await runQuery(`SELECT ${fields} FROM businesses WHERE id=$1`, [owner.business_id]);
        return json({ ok: true, business });
      }
      const body = readJson(event, ['name', 'description', 'address', 'phone', 'theme_color'], [], env);
      if (!Object.keys(body).length) throw new AdminError(400, 'VALIDATION_ERROR');
      const name = body.name === undefined ? undefined : text(body.name, 160);
      const desc = body.description === undefined ? undefined : description(body.description);
      const address = body.address === undefined ? undefined : optional(body.address, 300);
      const phone = body.phone === undefined ? undefined : optional(body.phone, 40);
      const theme = body.theme_color === undefined ? undefined : body.theme_color === null || body.theme_color === '' ? null : typeof body.theme_color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.theme_color) ? body.theme_color.toUpperCase() : undefined;
      if ((body.name !== undefined && !name) || (body.description !== undefined && desc === undefined) || (body.address !== undefined && address === undefined) || (body.phone !== undefined && phone === undefined) || (body.theme_color !== undefined && theme === undefined)) throw new AdminError(400, 'VALIDATION_ERROR');
      const values = { name, description: desc, address, phone, theme_color: theme };
      const changes = Object.entries(values).filter(([, value]) => value !== undefined);
      const clauses = changes.map(([key], index) => `${key}=$${index + 2}`);
      const [business] = await runQuery(`UPDATE businesses SET ${clauses.join(', ')} WHERE id=$1 RETURNING ${fields}`, [owner.business_id, ...changes.map(([, value]) => value)]);
      return json({ ok: true, business });
    } catch (error) { return adminFailure(error, 'admin.business', log); }
  };
}
export const handler = createAdminBusinessHandler();
