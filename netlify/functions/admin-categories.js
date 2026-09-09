import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, boolean, queryId, readJson, text } from '../lib/admin-validation.js';

const fields = 'id::text AS id, name, image_url, image_public_id, sort_order, active';
export function createAdminCategoriesHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (!['GET', 'POST', 'PATCH'].includes(event.httpMethod)) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, POST, PATCH' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      if (event.httpMethod === 'GET') {
        const categories = await runQuery(`SELECT ${fields} FROM categories WHERE business_id = $1 ORDER BY sort_order, id LIMIT 1000`, [owner.business_id]);
        return json({ ok: true, categories });
      }
      if (event.httpMethod === 'POST') {
        const body = readJson(event, ['name', 'active'], ['name'], env);
        const name = text(body.name, 120); const active = body.active === undefined ? true : boolean(body.active);
        if (!name || active === undefined) throw new AdminError(400, 'VALIDATION_ERROR');
        const [category] = await runQuery(`INSERT INTO categories (business_id,name,active,sort_order) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort_order),0)+1 FROM categories WHERE business_id=$1)) RETURNING ${fields}`, [owner.business_id, name, active]);
        return json({ ok: true, category }, 201);
      }
      const categoryId = queryId(event, 'category_id');
      if (!categoryId) throw new AdminError(400, 'VALIDATION_ERROR');
      const body = readJson(event, ['name', 'active'], [], env);
      if (!Object.keys(body).length) throw new AdminError(400, 'VALIDATION_ERROR');
      const name = body.name === undefined ? null : text(body.name, 120);
      const active = body.active === undefined ? null : boolean(body.active);
      if ((body.name !== undefined && !name) || (body.active !== undefined && active === undefined)) throw new AdminError(400, 'VALIDATION_ERROR');
      const [category] = await runQuery(`UPDATE categories SET name=COALESCE($3,name), active=COALESCE($4,active) WHERE id=$1 AND business_id=$2 RETURNING ${fields}`, [categoryId, owner.business_id, name, active]);
      if (!category) throw new AdminError(404, 'CATEGORY_NOT_FOUND');
      return json({ ok: true, category });
    } catch (error) { return adminFailure(error, 'admin.categories', log); }
  };
}
export const handler = createAdminCategoriesHandler();
