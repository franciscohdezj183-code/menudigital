import { readSlug } from '../lib/public-params.js';
import { query } from '../lib/db.js';
import { logServerError } from '../lib/errors.js';
import { HTTP, json } from '../lib/response.js';

export function createPublicMenuHandler(runQuery = query, log = logServerError) {
  return async (event) => {
    if (event.httpMethod !== 'GET') {
      return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, HTTP.METHOD_NOT_ALLOWED, { Allow: 'GET' });
    }
    const slug = readSlug(event);
    if (!slug) {
      return json({ ok: false, error: 'INVALID_REQUEST' }, HTTP.BAD_REQUEST);
    }
    try {
      const [business] = await runQuery(`
        SELECT id, name, slug, logo_url, cover_url, promotion_cover_url, description, address, phone, theme_color
        FROM businesses
        WHERE slug = $1 AND active = TRUE
      `, [slug]);
      if (!business) return json({ ok: false, error: 'BUSINESS_NOT_FOUND' }, HTTP.NOT_FOUND);

      const categories = await runQuery(`
        SELECT id::text AS id, name, image_url, sort_order
        FROM categories
        WHERE business_id = $1 AND active = TRUE
        ORDER BY categories.sort_order ASC, categories.id ASC LIMIT 1000
      `, [business.id]);
      const promotions = await runQuery(`
        SELECT id::text AS id, title, description, image_url, price::text AS price, starts_at, ends_at, sort_order
        FROM promotions
        WHERE business_id = $1 AND active = TRUE
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at IS NULL OR ends_at >= NOW())
        ORDER BY sort_order ASC, id ASC LIMIT 1000
      `, [business.id]);
      return json({
        ok: true,
        business: {
          name: business.name, slug: business.slug,
          logo_url: business.logo_url, cover_url: business.cover_url, promotion_cover_url: business.promotion_cover_url,
          description: business.description, address: business.address, phone: business.phone, theme_color: business.theme_color,
        },
        categories: categories.map(({ id, name, image_url, sort_order }) => ({ id, name, image_url, sort_order })),
        promotions: promotions.map(({ id, title, description, image_url, price }) => ({ id, title, description, image_url, price })),
      });
    } catch (error) {
      log('public-menu.database', error);
      return json({ ok: false, error: 'SERVICE_UNAVAILABLE' }, HTTP.UNAVAILABLE);
    }
  };
}

export const handler = createPublicMenuHandler();


