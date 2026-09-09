import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';
const scenario = new URLSearchParams(location.search).get('state') || 'success';
// Fotografía de revisión: Pavel Danilyuk / Pexels, foto 5858169. Solo fixture; no se guarda en Neon.
const image = scenario === 'photo' ? 'https://images.pexels.com/photos/5858169/pexels-photo-5858169.jpeg?auto=compress&cs=tinysrgb&w=1200' : scenario === 'images' ? '/tests/fixtures/image.svg' : scenario === 'broken' ? '/tests/fixtures/not-an-image.png' : null;
const data = {
  ok: true,
  business: { name: 'Negocio de prueba visual', slug: 'visual-test', logo_url: null },
  category: { id: '9007199254740997', name: scenario === 'long' ? 'Preparadas y especialidades de la casa con un nombre largo' : 'Preparadas' },
  product: { id: '9007199254740999', name: scenario === 'long' ? 'Michelada Especial de la casa con un nombre extraordinariamente largo' : 'Michelada Especial',
    description: scenario === 'no-variants' ? null : scenario === 'long' ? ('Descripción completa con detalles y saltos de línea.\nUn párrafo adicional que se lee con calma.\n\n').repeat(6) : 'Preparada con limón, salsas de la casa y escarchado.\nUna opción refrescante para acompañar tus botanas.',
    price: scenario === 'long' ? '9999999999.99' : '75.50', image_url: image, available: !['sold-out', 'long'].includes(scenario), featured: true },
  variants: scenario === 'no-variants' ? [] : [
    { id: '9', name: scenario === 'long' ? 'Presentación con un nombre especialmente largo sin recortar información' : '355 ml', price: scenario === 'long' ? '9999999999.99' : '65.00', sort_order: 1 },
    { id: '10', name: '473 ml', price: '75.50', sort_order: 1 },
    { id: '9007199254740998', name: '1 litro', price: '110.00', sort_order: 2 },
  ],
};
let attempts = 0;
window.fetch = async url => {
  if (url.includes('public-category')) return new Response(JSON.stringify({ ...data, products: [data.product] }));
  if (url.includes('public-menu')) return new Response(JSON.stringify({ ...data, categories: [data.category] }));
  if (scenario === 'loading') return new Promise(() => {});
  const codes = { 'not-found': 'PRODUCT_NOT_FOUND', 'category-not-found': 'CATEGORY_NOT_FOUND', 'business-not-found': 'BUSINESS_NOT_FOUND' };
  if (codes[scenario]) return new Response(JSON.stringify({ error: codes[scenario] }), { status: 404 });
  if (scenario === 'error' && attempts++ === 0) return new Response('{}', { status: 503 });
  return new Response(JSON.stringify(data));
};
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/visual-test/categoria/9007199254740997/producto/9007199254740999']}><App /></MemoryRouter>);
