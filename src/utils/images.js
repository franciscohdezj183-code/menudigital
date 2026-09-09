export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return url;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

export function optimizedImageUrl(value, { width, height } = {}) {
  const safe = safeImageUrl(value);
  if (!safe) return null;
  try {
    const url = new URL(safe, globalThis.location?.origin ?? 'http://localhost');
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return safe;
    const marker = '/image/upload/';
    const index = url.pathname.indexOf(marker);
    if (index < 0) return safe;
    const size = [Number.isInteger(width) && width > 0 ? `w_${width}` : '', Number.isInteger(height) && height > 0 ? `h_${height}` : ''].filter(Boolean);
    const transforms = ['f_auto', 'q_auto', ...size].join(',');
    url.pathname = `${url.pathname.slice(0, index + marker.length)}${transforms}/${url.pathname.slice(index + marker.length)}`;
    return url.href;
  } catch { return safe; }
}

export function initials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase('es');
}
