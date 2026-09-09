import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, boolean, description, price, queryId, readJson, text } from '../lib/admin-validation.js';

const allowed = ['title', 'description', 'price', 'starts_at', 'ends_at', 'active'];
const fields = 'id::text AS id,title,description,image_url,price::text AS price,starts_at,ends_at,active,sort_order';
const optionalPrice = value => value === null || value === '' ? null : price(value);
const instant = value => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40 || !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
};
function values(body, partial = false) {
  const result = {};
  if (!partial || 'title' in body) result.title = text(body.title, 160);
  if (!partial || 'description' in body) result.description = description(body.description);
  if (!partial || 'price' in body) result.price = optionalPrice(body.price);
  if (!partial || 'starts_at' in body) result.starts_at = instant(body.starts_at);
  if (!partial || 'ends_at' in body) result.ends_at = instant(body.ends_at);
  if (!partial || 'active' in body) result.active = boolean(body.active);
  if (Object.values(result).some(value => value === undefined)) throw new AdminError(400, 'VALIDATION_ERROR');
  return result;
}
export function createAdminPromotionsHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (!['GET', 'POST', 'PATCH'].includes(event.httpMethod)) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, POST, PATCH' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      if (event.httpMethod === 'GET') {
        const [cover] = await runQuery('SELECT promotion_cover_url FROM businesses WHERE id=$1', [owner.business_id]);
        const promotions = await runQuery(`SELECT ${fields} FROM promotions WHERE business_id=$1 ORDER BY sort_order,id LIMIT 1000`, [owner.business_id]);
        return json({ ok: true, promotion_cover_url: cover?.promotion_cover_url ?? null, promotions });
      }
      if (event.httpMethod === 'POST') {
        const body = readJson(event, allowed, ['title'], env);
        body.description ??= null; body.price ??= null; body.starts_at ??= null; body.ends_at ??= null; body.active ??= true;
        const value = values(body);
        if (value.starts_at && value.ends_at && value.ends_at < value.starts_at) throw new AdminError(400, 'VALIDATION_ERROR');
        const [promotion] = await runQuery(`INSERT INTO promotions (business_id,title,description,price,starts_at,ends_at,active,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(sort_order),0)+1 FROM promotions WHERE business_id=$1)) RETURNING ${fields}`, [owner.business_id,value.title,value.description,value.price,value.starts_at,value.ends_at,value.active]);
        return json({ ok: true, promotion }, 201);
      }
      const promotionId = queryId(event, 'promotion_id');
      if (!promotionId) throw new AdminError(400, 'VALIDATION_ERROR');
      const body = readJson(event, allowed, [], env); if (!Object.keys(body).length) throw new AdminError(400, 'VALIDATION_ERROR');
      const [current] = await runQuery(`SELECT ${fields} FROM promotions WHERE id=$1 AND business_id=$2`, [promotionId, owner.business_id]);
      if (!current) throw new AdminError(404, 'PROMOTION_NOT_FOUND');
      const patch = values(body, true);
      const value = { ...current, ...patch };
      if (value.starts_at && value.ends_at && new Date(value.ends_at) < new Date(value.starts_at)) throw new AdminError(400, 'VALIDATION_ERROR');
      const [promotion] = await runQuery(`UPDATE promotions SET title=$3,description=$4,price=$5,starts_at=$6,ends_at=$7,active=$8 WHERE id=$1 AND business_id=$2 RETURNING ${fields}`, [promotionId,owner.business_id,value.title,value.description,value.price,value.starts_at,value.ends_at,value.active]);
      return json({ ok: true, promotion });
    } catch (error) { return adminFailure(error, 'admin.promotions', log); }
  };
}
export const handler = createAdminPromotionsHandler();
