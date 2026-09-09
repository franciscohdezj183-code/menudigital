import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, queryId } from '../lib/admin-validation.js';

export function createAdminProductHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const productId = queryId(event, 'product_id');
      if (!productId) throw new AdminError(400, 'VALIDATION_ERROR');
      const [product] = await runQuery(`SELECT p.id::text AS id,p.category_id::text AS category_id,p.name,p.description,p.price::text AS price,p.image_url,p.image_public_id,p.active,p.available,p.featured,p.sort_order,c.name AS category_name FROM products p JOIN categories c ON c.id=p.category_id AND c.business_id=p.business_id WHERE p.id=$1 AND p.business_id=$2`, [productId, owner.business_id]);
      if (!product) throw new AdminError(404, 'PRODUCT_NOT_FOUND');
      const variants = await runQuery(`SELECT id::text AS id,name,price::text AS price,active,sort_order FROM product_variants WHERE product_id=$1 AND business_id=$2 ORDER BY sort_order,id LIMIT 1000`, [productId, owner.business_id]);
      const category = { id: product.category_id, name: product.category_name }; delete product.category_name;
      return json({ ok: true, product, category, variants });
    } catch (error) { return adminFailure(error, 'admin.product', log); }
  };
}
export const handler = createAdminProductHandler();
