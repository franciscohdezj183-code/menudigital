export function singleParameter(event, name) {
  if ((event.multiValueQueryStringParameters?.[name]?.length ?? 1) !== 1) return null;
  const value = event.queryStringParameters?.[name];
  return typeof value === 'string' ? value : null;
}

export function readSlug(event) {
  const slug = singleParameter(event, 'slug')?.trim().toLowerCase();
  return slug && slug.length <= 120 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

export function readPositiveId(event, name) {
  const value = singleParameter(event, name);
  if (!value || !/^[1-9][0-9]{0,18}$/.test(value)) return null;
  // BIGINT de PostgreSQL es un entero firmado de 64 bits, no un Number de JS.
  return BigInt(value) <= 9223372036854775807n ? value : null;
}

export const readCategoryId = event => readPositiveId(event, 'category_id');
export const readProductId = event => readPositiveId(event, 'product_id');
