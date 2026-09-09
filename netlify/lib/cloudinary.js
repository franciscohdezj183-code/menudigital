import { randomUUID } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { AdminError, validId } from './admin-validation.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
export const MAX_IMAGE_WIDTH = 12000;
export const MAX_IMAGE_HEIGHT = 12000;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const UPLOAD_AUTH_SECONDS = 10 * 60;

const targets = {
  business_logo: { table: 'businesses', url: 'logo_url', publicId: 'logo_public_id', entity: false, folder: 'logos' },
  business_cover: { table: 'businesses', url: 'cover_url', publicId: 'cover_public_id', entity: false, folder: 'covers' },
  promotion_cover: { table: 'businesses', url: 'promotion_cover_url', publicId: 'promotion_cover_public_id', entity: false, folder: 'promotion-covers' },
  category: { table: 'categories', url: 'image_url', publicId: 'image_public_id', entity: true, folder: 'categories' },
  product: { table: 'products', url: 'image_url', publicId: 'image_public_id', entity: true, folder: 'products' },
  promotion: { table: 'promotions', url: 'image_url', publicId: 'image_public_id', entity: true, folder: 'promotions' },
};

export function cloudinaryConfig(env = process.env) {
  const cloud_name = env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = env.CLOUDINARY_API_KEY?.trim();
  const api_secret = env.CLOUDINARY_API_SECRET?.trim();
  if (!cloud_name || !api_key || !api_secret) throw new Error('Cloudinary no está configurado.');
  return { cloud_name, api_key, api_secret };
}

export function cloudinaryClient(env = process.env) {
  const config = cloudinaryConfig(env);
  cloudinary.config({ ...config, secure: true });
  return cloudinary;
}

export function mediaTarget(value, entityId, businessId) {
  const target = targets[value];
  if (!target || (target.entity && !validId(entityId)) || (!target.entity && entityId !== undefined)) throw new AdminError(400, 'VALIDATION_ERROR');
  return { ...target, name: value, entityId: target.entity ? entityId : businessId, folder: `digital-menu/${businessId}/${target.folder}/` };
}

export async function ownedMedia(runQuery, businessId, target) {
  const [row] = await runQuery(`SELECT id::text AS id, ${target.url} AS image_url, ${target.publicId} AS image_public_id FROM ${target.table} WHERE id=$1 AND ${target.table === 'businesses' ? 'id' : 'business_id'}=$2`, [target.entityId, businessId]);
  if (!row) throw new AdminError(404, target.name === 'category' ? 'CATEGORY_NOT_FOUND' : target.name === 'product' ? 'PRODUCT_NOT_FOUND' : target.name === 'promotion' ? 'PROMOTION_NOT_FOUND' : 'BUSINESS_NOT_FOUND');
  return row;
}

export function signedUpload(client, config, target) {
  const timestamp = Math.floor(Date.now() / 1000);
  const public_id = randomUUID();
  const params = { timestamp, folder: target.folder.slice(0, -1), public_id, allowed_formats: IMAGE_FORMATS.join(',') };
  return { cloud_name: config.cloud_name, api_key: config.api_key, ...params, signature: client.utils.api_sign_request(params, config.api_secret) };
}

export function verifyUploadAuthorization(client, config, target, publicId, timestamp, signature, now = Math.floor(Date.now() / 1000)) {
  if (!Number.isSafeInteger(timestamp) || timestamp < now - UPLOAD_AUTH_SECONDS || timestamp > now + 60 || typeof signature !== 'string') throw new AdminError(400, 'VALIDATION_ERROR');
  if (typeof publicId !== 'string' || !publicId.startsWith(target.folder)) throw new AdminError(400, 'VALIDATION_ERROR');
  const leafPublicId = publicId.slice(target.folder.length);
  if (!/^[0-9a-f-]{36}$/.test(leafPublicId)) throw new AdminError(400, 'VALIDATION_ERROR');
  const params = { timestamp, folder: target.folder.slice(0, -1), public_id: leafPublicId, allowed_formats: IMAGE_FORMATS.join(',') };
  const expected = client.utils.api_sign_request(params, config.api_secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) throw new AdminError(400, 'VALIDATION_ERROR');
}

export function verifiedImage(resource, target, requestedPublicId) {
  const format = String(resource?.format ?? '').toLowerCase();
  const width = resource?.width;
  const height = resource?.height;
  if (resource?.resource_type !== 'image' || resource?.type !== 'upload' || resource?.public_id !== requestedPublicId || !requestedPublicId.startsWith(target.folder) || !IMAGE_FORMATS.includes(format) || !Number.isSafeInteger(resource.bytes) || resource.bytes < 1 || resource.bytes > MAX_IMAGE_BYTES || !Number.isSafeInteger(width) || width < 1 || width > MAX_IMAGE_WIDTH || !Number.isSafeInteger(height) || height < 1 || height > MAX_IMAGE_HEIGHT || width * height > MAX_IMAGE_PIXELS || typeof resource.secure_url !== 'string' || !resource.secure_url.startsWith('https://res.cloudinary.com/')) throw new AdminError(400, 'VALIDATION_ERROR');
  return resource.secure_url;
}
