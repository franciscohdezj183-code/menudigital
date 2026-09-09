import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';
const scenario = new URLSearchParams(location.search).get('state') || 'dashboard';
let authenticated = !['login', 'login-error', 'login-loading'].includes(scenario);
const identity = { ok: true, user: { id: '1', name: scenario === 'long' ? 'Nombre de propietario especialmente largo para comprobar el diseño' : 'Owner Demo', email: 'owner@fixture.test', role: 'OWNER' }, business: { name: scenario === 'long' ? 'Un negocio con un nombre extenso y varias palabras para revisar la interfaz' : 'Negocio Demo', slug: 'negocio-demo', logo_url: null } };
const summary = { categories: 4, products: 14, available_products: 13, unavailable_products: 1, featured_products: 3 };
if (scenario === 'empty') for (const key of Object.keys(summary)) summary[key] = 0;
let attempts = 0;
const categories = [{ id: '1', name: 'Cervezas', image_url: null, sort_order: 1, active: true }, { id: '2', name: 'Categoría oculta con nombre largo para revisar', image_url: null, sort_order: 2, active: false }];
const products = [{ id: '10', category_id: '1', name: 'Modelo Especial', description: null, price: '50.00', active: true, available: true, featured: true, sort_order: 1, category: { id: '1', name: 'Cervezas' } }, { id: '11', category_id: '2', name: 'Michelada Mango con un nombre especialmente largo', description: '', price: '75.50', active: false, available: false, featured: false, sort_order: 1, category: { id: '2', name: 'Categoría oculta con nombre largo para revisar' } }];
window.fetch = async (url, options = {}) => {
  if (url.includes('/auth/me')) {
    if (scenario === 'session-loading') return new Promise(() => {});
    return new Response(JSON.stringify(authenticated ? identity : { error: 'UNAUTHORIZED' }), { status: authenticated ? 200 : 401 });
  }
  if (url.includes('/auth/login')) {
    if (scenario === 'login-loading') return new Promise(() => {});
    if (scenario === 'login-error') return new Response('{"error":"INVALID_CREDENTIALS"}', { status: 401 });
    authenticated = true; return new Response(JSON.stringify(identity));
  }
  if (url.includes('/auth/logout')) { authenticated = false; return new Response('{"ok":true}'); }
  if (url.includes('/admin/qr')) return new Response(JSON.stringify({ ok: true, qr: { public_url: 'https://menu.example.test/negocio-demo', slug: 'negocio-demo', business_name: 'Negocio Demo', logo_url: null, theme_color: '#9250D8', is_local_url: false } }));
  if (url.includes('/admin/categories')) return new Response(JSON.stringify({ ok: true, categories }));
  if (url.includes('/admin/product?')) return new Response(JSON.stringify({ ok: true, product: products[0], category: products[0].category, variants: [{ id: '20', product_id: '10', name: 'Chico', price: '30.00', active: false, sort_order: 1 }, { id: '21', product_id: '10', name: 'Grande', price: '50.00', active: true, sort_order: 2 }] }));
  if (url.includes('/admin/products')) return new Response(JSON.stringify({ ok: true, products }));
  if (scenario === 'overview-loading') return new Promise(() => {});
  if (scenario === 'error' && attempts++ === 0) return new Response('{}', { status: 503 });
  return new Response(JSON.stringify({ ok: true, business: identity.business, summary }));
};
const paths = { 'menu-categories': '/admin/menu', 'menu-products': '/admin/menu?tab=products', 'category-form': '/admin/menu/categorias/nueva', 'product-form': '/admin/menu/productos/10/editar', qr: '/admin/qr' };
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[authenticated ? (paths[scenario] || '/admin') : '/admin/login']}><App /></MemoryRouter>);
