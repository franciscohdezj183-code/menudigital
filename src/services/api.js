export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getPublicMenu(slug, options = {}) {
  const params = new URLSearchParams({ slug });
  return api(`/public-menu?${params}`, options);
}

export async function api(path, options = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError('Usa una ruta relativa a /api, por ejemplo /health.');
  }
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const allowedCodes = ['INVALID_CREDENTIALS', 'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_REQUEST', 'VALIDATION_ERROR', 'PAYLOAD_TOO_LARGE', 'TOO_MANY_REQUESTS', 'BUSINESS_NOT_FOUND', 'CATEGORY_NOT_FOUND', 'PRODUCT_NOT_FOUND', 'VARIANT_NOT_FOUND', 'PROMOTION_NOT_FOUND', 'MEDIA_UNAVAILABLE', 'PUBLIC_URL_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'UNAVAILABLE', 'METHOD_NOT_ALLOWED'];
    const code = allowedCodes.includes(payload?.error) ? payload.error : null;
    throw new ApiError('La solicitud a la API falló.', response.status, code);
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new ApiError('La API devolvió una respuesta JSON inválida.', response.status);
  }
}

export function getPublicCategory(slug, categoryId, options = {}) {
  const params = new URLSearchParams({ slug, category_id: categoryId });
  return api(`/public-category?${params}`, options);
}

export function getPublicProduct(slug, categoryId, productId, options = {}) {
  const params = new URLSearchParams({ slug, category_id: categoryId, product_id: productId });
  return api(`/public-product?${params}`, options);
}

export const getCurrentUser = (options = {}) => api('/auth/me', { credentials: 'same-origin', ...options });
export const getAdminOverview = (options = {}) => api('/admin/overview', { credentials: 'same-origin', ...options });
export const getAdminQr = (options = {}) => api('/admin/qr', { credentials: 'same-origin', ...options });
export const login = (email, password, options = {}) => api('/auth/login', { ...options, method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
export const logout = (options = {}) => api('/auth/logout', { ...options, method: 'POST', credentials: 'same-origin' });

const adminJson = (path, method, body, options = {}) => api(path, { ...options, method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(body) });
export const getAdminCategories = (options = {}) => api('/admin/categories', { credentials: 'same-origin', ...options });
export const createAdminCategory = (body, options) => adminJson('/admin/categories', 'POST', body, options);
export const updateAdminCategory = (id, body, options) => adminJson(`/admin/categories?category_id=${encodeURIComponent(id)}`, 'PATCH', body, options);
export const reorderAdminCategories = (ids, options) => adminJson('/admin/categories/reorder', 'POST', { category_ids: ids }, options);
export const getAdminProducts = (options = {}) => api('/admin/products', { credentials: 'same-origin', ...options });
export const getAdminProduct = (id, options = {}) => api(`/admin/product?product_id=${encodeURIComponent(id)}`, { credentials: 'same-origin', ...options });
export const createAdminProduct = (body, options) => adminJson('/admin/products', 'POST', body, options);
export const updateAdminProduct = (id, body, options) => adminJson(`/admin/products?product_id=${encodeURIComponent(id)}`, 'PATCH', body, options);
export const reorderAdminProducts = (categoryId, ids, options) => adminJson('/admin/products/reorder', 'POST', { category_id: categoryId, product_ids: ids }, options);
export const createAdminVariant = (body, options) => adminJson('/admin/variants', 'POST', body, options);
export const updateAdminVariant = (id, body, options) => adminJson(`/admin/variants?variant_id=${encodeURIComponent(id)}`, 'PATCH', body, options);
export const reorderAdminVariants = (productId, ids, options) => adminJson('/admin/variants/reorder', 'POST', { product_id: productId, variant_ids: ids }, options);
export const getAdminBusiness = (options = {}) => api('/admin/business', { credentials: 'same-origin', ...options });
export const updateAdminBusiness = (body, options) => adminJson('/admin/business', 'PATCH', body, options);
export const getAdminPromotions = (options = {}) => api('/admin/promotions', { credentials: 'same-origin', ...options });
export const getAdminPromotion = (id, options = {}) => api(`/admin/promotion?promotion_id=${encodeURIComponent(id)}`, { credentials: 'same-origin', ...options });
export const createAdminPromotion = (body, options) => adminJson('/admin/promotions', 'POST', body, options);
export const updateAdminPromotion = (id, body, options) => adminJson(`/admin/promotions?promotion_id=${encodeURIComponent(id)}`, 'PATCH', body, options);
export const reorderAdminPromotions = (ids, options) => adminJson('/admin/promotions/reorder', 'POST', { promotion_ids: ids }, options);

export async function uploadAdminImage(file, target, entityId) {
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new ApiError('Selecciona una imagen JPG, PNG o WebP de hasta 5 MB.', 400, 'VALIDATION_ERROR');
  const targetBody = entityId ? { target, entity_id: entityId } : { target };
  const { upload } = await adminJson('/admin/media/sign', 'POST', targetBody);
  const data = new FormData(); data.set('file', file);
  for (const key of ['api_key', 'timestamp', 'signature', 'folder', 'public_id', 'allowed_formats']) data.set(key, String(upload[key]));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(upload.cloud_name)}/image/upload`, { method: 'POST', body: data });
  const uploaded = await response.json().catch(() => null);
  // Un 401 de Cloudinary es un fallo externo de carga, no una sesión admin expirada.
  if (!response.ok || typeof uploaded?.public_id !== 'string') throw new ApiError('No pudimos subir la imagen.', 502, 'MEDIA_UPLOAD_FAILED');
  return adminJson('/admin/media/complete', 'POST', { ...targetBody, public_id: uploaded.public_id, upload_timestamp: upload.timestamp, upload_signature: upload.signature });
}
export const removeAdminImage = (target, entityId) => adminJson('/admin/media/remove', 'POST', entityId ? { target, entity_id: entityId } : { target });
