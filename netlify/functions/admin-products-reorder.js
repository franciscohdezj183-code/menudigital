import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, idList, readJson, validId } from '../lib/admin-validation.js';

export function createProductsReorderHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const body = readJson(event, ['category_id', 'product_ids'], ['category_id', 'product_ids'], env);
      const ids = idList(body.product_ids);
      if (!validId(body.category_id) || !ids) throw new AdminError(400, 'VALIDATION_ERROR');
      const [result] = await runQuery(`WITH supplied AS (SELECT id,ord::int FROM unnest($1::bigint[]) WITH ORDINALITY x(id,ord)), current_ids AS MATERIALIZED (SELECT id FROM products WHERE business_id=$2 AND category_id=$3), valid AS (SELECT EXISTS(SELECT 1 FROM categories WHERE id=$3 AND business_id=$2) AND (SELECT count(*) FROM supplied)=(SELECT count(*) FROM current_ids) AND (SELECT count(*) FROM supplied s JOIN current_ids c USING(id))=(SELECT count(*) FROM current_ids) AS ok), updated AS (UPDATE products p SET sort_order=s.ord FROM supplied s WHERE p.id=s.id AND p.business_id=$2 AND p.category_id=$3 AND (SELECT ok FROM valid) RETURNING p.id) SELECT ok FROM valid`, [ids, owner.business_id, body.category_id]);
      if (!result?.ok) throw new AdminError(400, 'VALIDATION_ERROR');
      return json({ ok: true });
    } catch (error) { return adminFailure(error, 'admin.products.reorder', log); }
  };
}
export const handler = createProductsReorderHandler();
