import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { adminFailure, readJson } from '../lib/admin-validation.js';
import { cloudinaryClient, mediaTarget, ownedMedia } from '../lib/cloudinary.js';

export function createMediaRemoveHandler(runQuery = query, env = process.env, log = logServerError, getClient = cloudinaryClient) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const body = readJson(event, ['target', 'entity_id'], ['target'], env);
      const target = mediaTarget(body.target, body.entity_id, owner.business_id);
      const current = await ownedMedia(runQuery, owner.business_id, target);
      const client = current.image_public_id ? getClient(env) : null;
      await runQuery(`UPDATE ${target.table} SET ${target.url}=NULL, ${target.publicId}=NULL WHERE id=$1 AND ${target.table === 'businesses' ? 'id' : 'business_id'}=$2`, [target.entityId, owner.business_id]);
      if (current.image_public_id) await client.uploader.destroy(current.image_public_id, { resource_type: 'image', type: 'upload', invalidate: true }).catch(error => log('admin.media.destroy_removed', error));
      return json({ ok: true });
    } catch (error) {
      if (error.message === 'Cloudinary no está configurado.') return json({ ok: false, error: 'MEDIA_UNAVAILABLE' }, 503);
      return adminFailure(error, 'admin.media.remove', log);
    }
  };
}
export const handler = createMediaRemoveHandler();
