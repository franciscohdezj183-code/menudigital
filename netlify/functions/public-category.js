import { query } from '../lib/db.js';
import { logServerError } from '../lib/errors.js';
import { HTTP, json } from '../lib/response.js';
import { readSlug, readCategoryId } from '../lib/public-params.js';

export function createPublicCategoryHandler(runQuery = query, log = logServerError) {
  return async (event) => {
    if (event.httpMethod !== 'GET') {
      return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, HTTP.METHOD_NOT_ALLOWED, { Allow: 'GET' });
    }
    const slug = readSlug(event);
    const categoryId = readCategoryId(event);
    if (!slug || !categoryId) return json({ ok: false, error: 'INVALID_REQUEST' }, HTTP.BAD_REQUEST);

    try {
      const [business] = await runQuery(`
        SELECT id::text AS id, name, slug, logo_url, theme_color
        FROM businesses WHERE slug = $1 AND active = TRUE
      `, [slug]);
      if (!business) return json({ ok: false, error: 'BUSINESS_NOT_FOUND' }, HTTP.NOT_FOUND);

      const [category] = await runQuery(`
        SELECT id::text AS id, name, image_url
        FROM categories WHERE id = $1 AND business_id = $2 AND active = TRUE
      `, [categoryId, business.id]);
      if (!category) return json({ ok: false, error: 'CATEGORY_NOT_FOUND' }, HTTP.NOT_FOUND);

      const products = await runQuery(`
        SELECT id::text AS id, name, description, price::text AS price,
               image_url, available, featured, sort_order
        FROM products
        WHERE business_id = $1 AND category_id = $2 AND active = TRUE
        ORDER BY products.featured DESC, products.sort_order ASC, products.id ASC LIMIT 1000
      `, [business.id, category.id]);
      return json({
        ok: true,
        business: { name: business.name, slug: business.slug, logo_url: business.logo_url, theme_color: business.theme_color },
        category: { id: category.id, name: category.name, image_url: category.image_url },
        products: products.map(({ id, name, description, price, image_url, available, featured, sort_order }) => ({
          id, name, description, price, image_url, available, featured, sort_order,
        })),
      });
    } catch (error) {
      log('public-category.database', error);
      return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, HTTP.UNAVAILABLE);
    }
  };
}

export const handler = createPublicCategoryHandler();

