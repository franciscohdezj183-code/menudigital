import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, idList, readJson } from '../lib/admin-validation.js';

export function createCategoriesReorderHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const ids = idList(readJson(event, ['category_ids'], ['category_ids'], env).category_ids);
      if (!ids) throw new AdminError(400, 'VALIDATION_ERROR');
      const [result] = await runQuery(`WITH supplied AS (SELECT id, ord::int FROM unnest($1::bigint[]) WITH ORDINALITY AS x(id,ord)), current_ids AS MATERIALIZED (SELECT id FROM categories WHERE business_id=$2), valid AS (SELECT (SELECT count(*) FROM supplied)=(SELECT count(*) FROM current_ids) AND (SELECT count(*) FROM supplied s JOIN current_ids c USING(id))=(SELECT count(*) FROM current_ids) AS ok), updated AS (UPDATE categories c SET sort_order=s.ord FROM supplied s WHERE c.id=s.id AND c.business_id=$2 AND (SELECT ok FROM valid) RETURNING c.id) SELECT ok, (SELECT count(*)::int FROM updated) AS updated FROM valid`, [ids, owner.business_id]);
      if (!result?.ok) throw new AdminError(400, 'VALIDATION_ERROR');
      return json({ ok: true });
    } catch (error) { return adminFailure(error, 'admin.categories.reorder', log); }
  };
}
export const handler = createCategoriesReorderHandler();
