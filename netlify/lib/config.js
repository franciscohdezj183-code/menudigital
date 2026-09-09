export function getDatabaseUrl(env = process.env) {
  const value = env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL es obligatoria en el servidor.');
  let url;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL no es válida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.pathname.length < 2) {
    throw new Error('DATABASE_URL no es una conexión PostgreSQL válida.');
  }
  if (!['require', 'verify-full'].includes(url.searchParams.get('sslmode'))) {
    throw new Error('DATABASE_URL debe requerir TLS: sslmode=require o verify-full.');
  }
  return value;
}

export class PublicSiteUrlError extends Error {}

export function getPublicSiteUrl(env = process.env) {
  const value = env.PUBLIC_SITE_URL?.trim();
  if (!value) throw new PublicSiteUrlError('PUBLIC_SITE_URL no está configurada.');
  let url;
  try { url = new URL(value); } catch { throw new PublicSiteUrlError('PUBLIC_SITE_URL no es válida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new PublicSiteUrlError('PUBLIC_SITE_URL debe ser una URL HTTP(S) sin credenciales, query ni fragmento.');
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new PublicSiteUrlError('PUBLIC_SITE_URL debe usar HTTPS en producción.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

export function publicMenuUrl(baseUrl, slug) {
  return `${baseUrl}/${encodeURIComponent(slug)}`;
}

export function isLocalSiteUrl(value) {
  let hostname;
  try { hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 127 || parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}
