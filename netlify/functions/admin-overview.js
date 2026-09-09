import { query } from '../lib/db.js';
import { json } from '../lib/response.js';
import { logServerError } from '../lib/errors.js';
import { requireOwner, publicIdentity, authFailure } from '../lib/auth.js';
export function createOverviewHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const [summary] = await runQuery(`
        SELECT (SELECT count(*)::int FROM categories WHERE business_id = $1) AS categories,
          count(*)::int AS products,
          count(*) FILTER (WHERE available)::int AS available_products,
          count(*) FILTER (WHERE NOT available)::int AS unavailable_products,
          count(*) FILTER (WHERE featured)::int AS featured_products
        FROM products WHERE business_id = $1
      `, [owner.business_id]);
      return json({ ok: true, business: { ...publicIdentity(owner).business, cover_url: owner.cover_url }, summary });
    } catch (error) { return authFailure(error, 'admin.overview', log); }
  };
}
export const handler = createOverviewHandler();
