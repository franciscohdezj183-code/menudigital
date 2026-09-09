import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, boolean, price, queryId, readJson, text, validId } from '../lib/admin-validation.js';
const fields = 'id::text AS id, product_id::text AS product_id, name, price::text AS price, active, sort_order';

export function createAdminVariantsHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (!['POST', 'PATCH'].includes(event.httpMethod)) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST, PATCH' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      if (event.httpMethod === 'POST') {
        const body = readJson(event, ['product_id', 'name', 'price'], ['product_id', 'name', 'price'], env);
        const name = text(body.name, 120); const amount = price(body.price);
        if (!validId(body.product_id) || !name || amount === undefined) throw new AdminError(400, 'VALIDATION_ERROR');
        const [variant] = await runQuery(`INSERT INTO product_variants (business_id,product_id,name,price,active,sort_order) SELECT $1,p.id,$3,$4,TRUE,(SELECT COALESCE(MAX(sort_order),0)+1 FROM product_variants WHERE business_id=$1 AND product_id=p.id) FROM products p WHERE p.id=$2 AND p.business_id=$1 RETURNING ${fields}`, [owner.business_id, body.product_id, name, amount]);
        if (!variant) throw new AdminError(404, 'PRODUCT_NOT_FOUND');
        return json({ ok: true, variant }, 201);
      }
      const variantId = queryId(event, 'variant_id');
      if (!variantId) throw new AdminError(400, 'VALIDATION_ERROR');
      const body = readJson(event, ['name', 'price', 'active'], [], env);
      if (!Object.keys(body).length) throw new AdminError(400, 'VALIDATION_ERROR');
      const name = body.name === undefined ? null : text(body.name, 120);
      const amount = body.price === undefined ? null : price(body.price);
      const active = body.active === undefined ? null : boolean(body.active);
      if ((body.name !== undefined && !name) || (body.price !== undefined && amount === undefined) || (body.active !== undefined && active === undefined)) throw new AdminError(400, 'VALIDATION_ERROR');
      const [variant] = await runQuery(`UPDATE product_variants v SET name=COALESCE($3,v.name),price=COALESCE($4,v.price),active=COALESCE($5,v.active) WHERE v.id=$1 AND v.business_id=$2 AND EXISTS(SELECT 1 FROM products p WHERE p.id=v.product_id AND p.business_id=$2) RETURNING ${fields}`, [variantId, owner.business_id, name, amount, active]);
      if (!variant) throw new AdminError(404, 'VARIANT_NOT_FOUND');
      return json({ ok: true, variant });
    } catch (error) { return adminFailure(error, 'admin.variants', log); }
  };
}
export const handler = createAdminVariantsHandler();
