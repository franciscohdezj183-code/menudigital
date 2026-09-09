import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, readJson } from '../lib/admin-validation.js';
import { cloudinaryClient, cloudinaryConfig, mediaTarget, ownedMedia, verifiedImage, verifyUploadAuthorization } from '../lib/cloudinary.js';

export function createMediaCompleteHandler(runQuery = query, env = process.env, log = logServerError, getClient = cloudinaryClient) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try {
      const owner = await requireOwner(event, runQuery, env);
      const body = readJson(event, ['target', 'entity_id', 'public_id', 'upload_timestamp', 'upload_signature'], ['target', 'public_id', 'upload_timestamp', 'upload_signature'], env);
      const target = mediaTarget(body.target, body.entity_id, owner.business_id);
      if (typeof body.public_id !== 'string' || body.public_id.length > 300 || !body.public_id.startsWith(target.folder)) throw new AdminError(400, 'VALIDATION_ERROR');
      const current = await ownedMedia(runQuery, owner.business_id, target);
      const client = getClient(env);
      const config = cloudinaryConfig(env);
      verifyUploadAuthorization(client, config, target, body.public_id, body.upload_timestamp, body.upload_signature);
      const resource = await client.api.resource(body.public_id, { resource_type: 'image', type: 'upload' });
      const secureUrl = verifiedImage(resource, target, body.public_id);
      const [updated] = await runQuery(`UPDATE ${target.table} SET ${target.url}=$3, ${target.publicId}=$4 WHERE id=$1 AND ${target.table === 'businesses' ? 'id' : 'business_id'}=$2 RETURNING id::text AS id, ${target.url} AS image_url`, [target.entityId, owner.business_id, secureUrl, body.public_id]);
      if (!updated) throw new AdminError(404, 'BUSINESS_NOT_FOUND');
      if (current.image_public_id && current.image_public_id !== body.public_id) await client.uploader.destroy(current.image_public_id, { resource_type: 'image', type: 'upload', invalidate: true }).catch(error => log('admin.media.destroy_previous', error));
      return json({ ok: true, media: updated });
    } catch (error) {
      if (error.message === 'Cloudinary no está configurado.') return json({ ok: false, error: 'MEDIA_UNAVAILABLE' }, 503);
      return adminFailure(error, 'admin.media.complete', log);
    }
  };
}
export const handler = createMediaCompleteHandler();
