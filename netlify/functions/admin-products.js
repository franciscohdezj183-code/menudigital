import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, boolean, description, price, queryId, readJson, text, validId } from '../lib/admin-validation.js';

const allowed = ['category_id', 'name', 'description', 'price', 'active', 'available', 'featured'];
const productFields = 'id::text AS id, category_id::text AS category_id, name, description, price::text AS price, image_url, image_public_id, active, available, featured, sort_order';
function values(body, partial = false) {
  const result = {};
  if (!partial || 'category_id' in body) result.categoryId = validId(body.category_id) ? body.category_id : undefined;
  if (!partial || 'name' in body) result.name = text(body.name, 160);
  if (!partial || 'description' in body) result.description = description(body.description);
  if (!partial || 'price' in body) result.price = price(body.price);
  for (const key of ['active', 'available', 'featured']) if (!partial || key in body) result[key] = boolean(body[key]);
  if (Object.values(result).some(value => value === undefined)) throw new AdminError(400, 'VALIDATION_ERROR');
  return result;
}

export function createAdminProductsHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (!['GET', 'POST', 'PATCH'].includes(event.httpMethod)) return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, POST, PATCH' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      if (event.httpMethod === 'GET') {
        const products = await runQuery(`SELECT p.${productFields.replaceAll(', ', ', p.')}, c.name AS category_name FROM products p JOIN categories c ON c.id=p.category_id AND c.business_id=p.business_id WHERE p.business_id=$1 ORDER BY c.sort_order,c.id,p.sort_order,p.id LIMIT 1000`, [owner.business_id]);
        return json({ ok: true, products: products.map(({ category_name, ...product }) => ({ ...product, category: { id: product.category_id, name: category_name } })) });
      }
      if (event.httpMethod === 'POST') {
        const body = readJson(event, allowed, ['category_id', 'name', 'price'], env);
        body.description ??= null; body.active ??= true; body.available ??= true; body.featured ??= false;
        const value = values(body);
        const [product] = await runQuery(`INSERT INTO products (business_id,category_id,name,description,price,image_url,active,available,featured,sort_order) SELECT $1,c.id,$3,$4,$5,NULL,$6,$7,$8,(SELECT COALESCE(MAX(sort_order),0)+1 FROM products WHERE business_id=$1 AND category_id=c.id) FROM categories c WHERE c.id=$2 AND c.business_id=$1 RETURNING ${productFields}`, [owner.business_id, value.categoryId, value.name, value.description, value.price, value.active, value.available, value.featured]);
        if (!product) throw new AdminError(404, 'CATEGORY_NOT_FOUND');
        return json({ ok: true, product }, 201);
      }
      const productId = queryId(event, 'product_id');
      if (!productId) throw new AdminError(400, 'VALIDATION_ERROR');
      const body = readJson(event, allowed, [], env);
      if (!Object.keys(body).length) throw new AdminError(400, 'VALIDATION_ERROR');
      const currentRows = await runQuery(`SELECT ${productFields} FROM products WHERE id=$1 AND business_id=$2`, [productId, owner.business_id]);
      const current = currentRows[0];
      if (!current) throw new AdminError(404, 'PRODUCT_NOT_FOUND');
      const patch = values(body, true);
      const categoryId = patch.categoryId ?? current.category_id;
      const [category] = await runQuery('SELECT id::text AS id FROM categories WHERE id=$1 AND business_id=$2', [categoryId, owner.business_id]);
      if (!category) throw new AdminError(404, 'CATEGORY_NOT_FOUND');
      const [product] = await runQuery(`UPDATE products SET category_id=$3,name=$4,description=$5,price=$6,active=$7,available=$8,featured=$9,sort_order=CASE WHEN category_id<>$3 THEN (SELECT COALESCE(MAX(sort_order),0)+1 FROM products WHERE business_id=$2 AND category_id=$3) ELSE sort_order END WHERE id=$1 AND business_id=$2 RETURNING ${productFields}`, [productId, owner.business_id, categoryId, patch.name ?? current.name, 'description' in patch ? patch.description : current.description, patch.price ?? current.price, patch.active ?? current.active, patch.available ?? current.available, patch.featured ?? current.featured]);
      if (!product) throw new AdminError(404, 'PRODUCT_NOT_FOUND');
      return json({ ok: true, product });
    } catch (error) { return adminFailure(error, 'admin.products', log); }
  };
}
export const handler = createAdminProductsHandler();
