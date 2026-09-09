import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, readJson } from '../lib/admin-validation.js';
import { cloudinaryClient, cloudinaryConfig, mediaTarget, ownedMedia, signedUpload } from '../lib/cloudinary.js';

export function createMediaSignHandler(runQuery = query, env = process.env, log = logServerError, getClient = cloudinaryClient) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const body = readJson(event, ['target', 'entity_id'], ['target'], env);
      const target = mediaTarget(body.target, body.entity_id, owner.business_id);
      await ownedMedia(runQuery, owner.business_id, target);
      const config = cloudinaryConfig(env);
      return json({ ok: true, upload: signedUpload(getClient(env), config, target) });
    } catch (error) {
      if (error.message === 'Cloudinary no está configurado.') return json({ ok: false, error: 'MEDIA_UNAVAILABLE' }, 503);
      return adminFailure(error, 'admin.media.sign', log);
    }
  };
}
export const handler = createMediaSignHandler();
