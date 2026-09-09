import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { adminFailure } from '../lib/admin-validation.js';
import { getPublicSiteUrl, isLocalSiteUrl, publicMenuUrl, PublicSiteUrlError } from '../lib/config.js';

export function createAdminQrHandler(runQuery = query, env = process.env, log = logServerError) {
  return async event => {
    if (event.httpMethod !== 'GET') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const siteUrl = getPublicSiteUrl(env);
      const publicUrl = publicMenuUrl(siteUrl, owner.slug);
      return json({
        ok: true,
        qr: {
          public_url: publicUrl,
          slug: owner.slug,
          business_name: owner.business_name,
          logo_url: owner.logo_url ?? null,
          theme_color: owner.theme_color ?? null,
          is_local_url: isLocalSiteUrl(siteUrl),
        },
      });
    } catch (error) {
      if (error instanceof PublicSiteUrlError) return json({ ok: false, error: 'PUBLIC_URL_UNAVAILABLE' }, 503);
      return adminFailure(error, 'admin.qr', log);
    }
  };
}

export const handler = createAdminQrHandler();
