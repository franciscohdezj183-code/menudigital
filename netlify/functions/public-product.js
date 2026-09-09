import { query } from '../lib/db.js';
import { logServerError } from '../lib/errors.js';
import { HTTP, json } from '../lib/response.js';
import { readSlug, readCategoryId, readProductId } from '../lib/public-params.js';

export function createPublicProductHandler(runQuery = query, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, HTTP.METHOD_NOT_ALLOWED, { Allow: 'GET' });
    const slug = readSlug(event);
    const categoryId = readCategoryId(event);
    const productId = readProductId(event);
    if (!slug || !categoryId || !productId) return json({ ok: false, error: 'INVALID_REQUEST' }, HTTP.BAD_REQUEST);
    try {
      const [business] = await runQuery('SELECT id::text AS id, name, slug, logo_url, theme_color FROM businesses WHERE slug = $1 AND active = TRUE', [slug]);
      if (!business) return json({ ok: false, error: 'BUSINESS_NOT_FOUND' }, HTTP.NOT_FOUND);
      const [category] = await runQuery('SELECT id::text AS id, name FROM categories WHERE id = $1 AND business_id = $2 AND active = TRUE', [categoryId, business.id]);
      if (!category) return json({ ok: false, error: 'CATEGORY_NOT_FOUND' }, HTTP.NOT_FOUND);
      const [product] = await runQuery(`
        SELECT id::text AS id, name, description, price::text AS price, image_url, available, featured
        FROM products WHERE id = $1 AND business_id = $2 AND category_id = $3 AND active = TRUE
      `, [productId, business.id, category.id]);
      if (!product) return json({ ok: false, error: 'PRODUCT_NOT_FOUND' }, HTTP.NOT_FOUND);
      const variants = await runQuery(`
        SELECT id::text AS id, name, price::text AS price, sort_order
        FROM product_variants WHERE business_id = $1 AND product_id = $2 AND active = TRUE
        ORDER BY product_variants.sort_order ASC, product_variants.id ASC LIMIT 1000
      `, [business.id, product.id]);
      return json({
        ok: true,
        business: { name: business.name, slug: business.slug, logo_url: business.logo_url, theme_color: business.theme_color },
        category: { id: category.id, name: category.name },
        product: { id: product.id, name: product.name, description: product.description, price: product.price, image_url: product.image_url, available: product.available, featured: product.featured },
        variants: variants.map(({ id, name, price, sort_order }) => ({ id, name, price, sort_order })),
      });
    } catch (error) {
      log('public-product.database', error);
      return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, HTTP.UNAVAILABLE);
    }
  };
}
export const handler = createPublicProductHandler();
