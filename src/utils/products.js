export function formatPrice(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return 'Precio no disponible';
  const [integer, decimals = '00'] = value.split('.');
  const whole = integer.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = decimals.padEnd(2, '0');
  return `$${whole}${cents === '00' ? '' : `.${cents}`}`;
}

export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
}

export function filterProducts(products, search) {
  const words = normalizeSearch(search).split(' ').filter(Boolean);
  if (!words.length) return products;
  return products.filter(product => {
    const text = normalizeSearch(`${product.name} ${product.description ?? ''}`);
    return words.every(word => text.includes(word));
  });
}
