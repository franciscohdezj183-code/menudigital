import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, idList, readJson, validId } from '../lib/admin-validation.js';
export function createVariantsReorderHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const body = readJson(event, ['product_id', 'variant_ids'], ['product_id', 'variant_ids'], env); const ids = idList(body.variant_ids);
      if (!validId(body.product_id) || !ids) throw new AdminError(400, 'VALIDATION_ERROR');
      const [result] = await runQuery(`WITH supplied AS (SELECT id,ord::int FROM unnest($1::bigint[]) WITH ORDINALITY x(id,ord)), current_ids AS MATERIALIZED (SELECT id FROM product_variants WHERE business_id=$2 AND product_id=$3), valid AS (SELECT EXISTS(SELECT 1 FROM products WHERE id=$3 AND business_id=$2) AND (SELECT count(*) FROM supplied)=(SELECT count(*) FROM current_ids) AND (SELECT count(*) FROM supplied s JOIN current_ids c USING(id))=(SELECT count(*) FROM current_ids) AS ok), updated AS (UPDATE product_variants v SET sort_order=s.ord FROM supplied s WHERE v.id=s.id AND v.business_id=$2 AND v.product_id=$3 AND (SELECT ok FROM valid) RETURNING v.id) SELECT ok FROM valid`, [ids, owner.business_id, body.product_id]);
      if (!result?.ok) throw new AdminError(400, 'VALIDATION_ERROR');
      return json({ ok: true });
    } catch (error) { return adminFailure(error, 'admin.variants.reorder', log); }
  };
}
export const handler = createVariantsReorderHandler();
