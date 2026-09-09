import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

const dom = new JSDOM('<!doctype html><html lang="es"><head><title>Menú digital</title></head><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
const sourceRoot = new URL('../src/', import.meta.url);
const outputRoot = new URL(`../.netlify/tests/frontend-${process.pid}/`, import.meta.url);
async function compileDirectory(source, output) {
  await mkdir(output, { recursive: true });
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (item.isDirectory()) {
      await compileDirectory(new URL(item.name + '/', source), new URL(item.name + '/', output));
    } else if (/\.(js|jsx)$/.test(item.name)) {
      const sourceCode = (await readFile(new URL(item.name, source), 'utf8')).replace(/\.jsx(['"])/g, '.mjs$1');
      const result = await transform(sourceCode, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
      await writeFile(new URL(item.name.replace(/\.jsx$/, '.mjs'), output), result.code);
    }
  }
}
await compileDirectory(sourceRoot, outputRoot);
const { default: App } = await import(new URL('App.mjs', outputRoot).href);
const data = {
  ok: true,
  business: { name: 'Prueba del menú', slug: 'test-menu', description: 'Descripción del negocio.', logo_url: '/logo-test.png', cover_url: '/cover-test.png', address: 'Dirección de prueba' },
  categories: [{ id: '9007199254740993', name: 'Categoría de prueba', image_url: '/category-test.png', sort_order: 0 }],
};
const response = (body = data, status = 200) => new Response(JSON.stringify(body), { status });
let navigate;
function Navigation() { navigate = useNavigate(); return null; }
async function mount(path) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App), React.createElement(Navigation))); });
  return { container, async close() { await act(async () => root.unmount()); container.remove(); } };
}

test('frontend: rutas, skeleton, éxito, fallbacks y título del negocio', async t => {
  let resolveRequest;
  const mock = t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { resolveRequest = resolve; }));
  const view = await mount('/test-menu');
  try {
    assert.ok(view.container.querySelector('[aria-label="Cargando el menú"]'));
    assert.equal(view.container.querySelectorAll('.skeleton-card').length, 3);
    await act(async () => resolveRequest(response()));
    assert.equal(document.title, 'Menú | Prueba del menú');
    assert.equal(view.container.querySelector('.business-name').textContent, data.business.name);
    assert.equal(view.container.querySelector('h1').textContent, data.business.name);
    assert.equal(view.container.querySelector('.welcome-heading'), null);
    assert.ok(!view.container.textContent.includes('¿Qué te podemos preparar?'));
    assert.equal(view.container.querySelector('.promotion-section'),null);
    assert.equal(view.container.querySelectorAll('.category-card').length, 1);
    assert.equal(view.container.querySelector('a.category-card').getAttribute('href'), '/test-menu/categoria/9007199254740993');
    assert.equal(view.container.querySelector('.category-card img').getAttribute('loading'), 'lazy');
    assert.equal(view.container.querySelector('.business-cover img').getAttribute('loading'), 'eager');
    assert.ok(view.container.querySelector('.business-avatar-flip'));
    assert.ok(view.container.querySelector('.business-avatar-flip__inner'));
    assert.ok(view.container.querySelector('.business-avatar-flip__front .business-logo'));
    const avatar=view.container.querySelector('.business-avatar-flip__back img');
    assert.equal(avatar.getAttribute('src'),'/avatar.gif');
    assert.equal(avatar.getAttribute('alt'),'Animación de brindis');
    const images = [...view.container.querySelectorAll('img:not([src="/avatar.gif"])')];
    assert.equal(images.length, 3);
    await act(async () => { for (const img of images) img.dispatchEvent(new window.Event('error')); });
    assert.equal(view.container.querySelectorAll('img').length, 1);
    assert.equal(view.container.querySelector('.business-logo').textContent, 'PD');
    assert.equal(view.container.querySelectorAll('.is-fallback').length, 3);
    assert.equal(mock.mock.calls[0].arguments[0], '/api/public-menu?slug=test-menu');
  } finally { await view.close(); }
});

test('flip 3D del avatar respeta movimiento reducido',async()=>{
  const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/perspective:\s*900px/);
  assert.match(css,/transform-style:\s*preserve-3d/);
  assert.match(css,/backface-visibility:\s*hidden/);
  assert.match(css,/@keyframes public-avatar-flip[\s\S]*rotateY\(180deg\)[\s\S]*rotateY\(360deg\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[\s\S]*business-avatar-flip__inner[\s\S]*animation:\s*none[\s\S]*business-avatar-flip__back[\s\S]*display:\s*none/);
});

test('frontend: menú vacío, 404 y error recuperable con Reintentar', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => response({}, 404));
  const view = await mount('/missing');
  try {
    assert.ok(view.container.textContent.includes('No encontramos este menú.'));
    mock.mock.mockImplementation(async () => response({}, 503));
    await act(async () => navigate('/unavailable'));
    assert.ok(view.container.textContent.includes('No pudimos cargar el menú.'));
    mock.mock.mockImplementation(async () => response({ ...data, categories: [] }));
    await act(async () => view.container.querySelector('button').click());
    assert.ok(view.container.textContent.includes('El menú estará disponible próximamente.'));
    assert.equal(view.container.querySelector('button'), null);
    assert.equal(view.container.querySelector('.category-card'), null);
  } finally { await view.close(); }
});

test('frontend: cambiar de empresa cancela la petición anterior y no muestra datos atrasados', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  const view = await mount('/first');
  try {
    await act(async () => navigate('/second'));
    assert.equal(requests[0].options.signal.aborted, true);
    assert.ok(view.container.querySelector('.skeleton-cover'));
    await act(async () => requests[1].resolve(response({ ...data, business: { ...data.business, name: 'Second business' } })));
    await act(async () => requests[0].resolve(response()));
    assert.equal(view.container.querySelector('.business-name').textContent, 'Second business');
    assert.equal(view.container.querySelector('h1').textContent, 'Second business');
    assert.equal(view.container.querySelector('.welcome-heading'), null);
    assert.equal(document.title, 'Menú | Second business');
  } finally { await view.close(); }
});

test('frontend: inicio y rutas desconocidas sin llamadas API', async t => {
  const mock = t.mock.method(globalThis, 'fetch', () => assert.fail('No debe llamar API'));
  const view = await mount('/');
  try {
    assert.ok(view.container.textContent.includes('Accede utilizando el código QR del establecimiento.'));
    await act(async () => navigate('/test/ruta-inexistente/1'));
    assert.ok(view.container.textContent.includes('No encontramos este menú.'));
    assert.equal(mock.mock.callCount(), 0);
  } finally { await view.close(); }
});




const categoryData = {
  ok: true,
  business: {name:'Negocio de prueba',slug:'test-menu',logo_url:null},
  category: {id:'9007199254740997',name:'Preparadas',image_url:null},
  products: [
    {id:'21',name:'Michelada Especial',description:'Limón y preparado de la casa.',price:'75.50',image_url:'/product-test.png',available:true,featured:true,sort_order:1},
    {id:'22',name:'Cubana',description:null,price:'80.00',image_url:null,available:false,featured:false,sort_order:2},
    {id:'23',name:'Michelada Clásica',description:'Escarchado de sal.',price:'65.00',image_url:null,available:true,featured:false,sort_order:3},
  ],
};
async function typeSearch(container,value){
  const input=container.querySelector('input[type="search"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
}
async function clickLink(link){
  await act(async()=>link.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0})));
}

test('categoría: loading, filas, precio, etiquetas, descripción nula e imagen rota',async t=>{
  let resolve;
  t.mock.method(globalThis,'fetch',()=>new Promise(r=>{resolve=r;}));
  const view=await mount('/test-menu/categoria/9007199254740997');
  try{
    assert.equal(view.container.querySelectorAll('.product-skeleton').length,5);
    await act(async()=>resolve(response(categoryData)));
    assert.equal(document.title,'Preparadas | Negocio de prueba');
    assert.equal(view.container.querySelectorAll('.product-row').length,3);
    assert.equal(view.container.querySelectorAll('.product-price').length,0);
    assert.equal(view.container.querySelectorAll('.product-arrow').length,3);
    assert.ok(!view.container.textContent.includes('$75.50'));
    assert.ok(!view.container.textContent.includes('$80'));
    assert.ok(view.container.textContent.includes('Recomendado'));
    assert.ok(view.container.querySelector('.is-unavailable').textContent.includes('Agotado'));
    assert.equal(view.container.querySelector('.is-unavailable .product-description'),null);
    assert.equal(view.container.querySelectorAll('a.product-row').length,3);
    assert.equal(view.container.querySelectorAll('.product-row button').length,0);
    assert.equal(view.container.querySelector('.category-header h1').textContent,'Preparadas');
    assert.equal(view.container.querySelector('.category-header').textContent.includes('Negocio de prueba'),false);
    assert.equal(view.container.querySelector('.category-business-logo'),null);
    assert.equal(view.container.querySelector('.category-controls h1').textContent,'Preparadas');
    assert.equal(view.container.querySelector('.category-hero-image.is-fallback') !== null,true);
    assert.equal(view.container.querySelector('.category-invitation').textContent,'¿Qué se te antoja?');
    const image=view.container.querySelector('.product-photo img');
    assert.equal(image.getAttribute('loading'),'lazy');
    await act(async()=>image.dispatchEvent(new window.Event('error')));
    assert.equal(view.container.querySelectorAll('.product-photo.is-fallback').length,3);
    assert.equal(view.container.querySelector('.back-link').getAttribute('href'),'/test-menu');
  }finally{await view.close();}
});

test('categoría: búsqueda por nombre y descripción, acentos, espacios y limpiar sin red',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async()=>response(categoryData));
  const view=await mount('/test-menu/categoria/9007199254740997');
  try{
    await typeSearch(view.container,'  MICHELADA  ');
    assert.equal(view.container.querySelectorAll('.product-row').length,2);
    await typeSearch(view.container,' limon CASA ');
    assert.equal(view.container.querySelectorAll('.product-row').length,1);
    await typeSearch(view.container,'no existe');
    assert.ok(view.container.textContent.includes('No encontramos productos con esa búsqueda.'));
    assert.ok(!view.container.textContent.includes('Aún no hay productos'));
    await act(async()=>view.container.querySelector('.category-empty button').click());
    assert.equal(view.container.querySelectorAll('.product-row').length,3);
    assert.equal(view.container.querySelector('input').value,'');
    assert.equal(document.activeElement,view.container.querySelector('input'));
    assert.equal(mock.mock.callCount(),1);
  }finally{await view.close();}
});

test('categoría: enlaces del menú navegan y volver usa la ruta explícita',async t=>{
  const categoryWithImage={...categoryData,category:{...categoryData.category,id:data.categories[0].id,image_url:'/category-hero.png'}};
  t.mock.method(globalThis,'fetch',async url=>response(url.includes('public-category')?categoryWithImage:data));
  const view=await mount('/test-menu');
  try{
    const card=view.container.querySelector('a.category-card');
    const contextMenu=new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});
    await act(async()=>card.dispatchEvent(contextMenu));
    assert.equal(contextMenu.defaultPrevented,true);
    const pointerDown=new window.Event('pointerdown',{bubbles:true,cancelable:true});
    Object.defineProperty(pointerDown,'pointerType',{value:'touch'});
    await act(async()=>card.dispatchEvent(pointerDown));
    assert.equal(card.classList.contains('is-touch-shining'),true);
    await act(async()=>{
      card.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
      await new Promise(resolve=>setTimeout(resolve,300));
    });
    assert.equal(view.container.querySelector('h1').textContent,'Preparadas');
    assert.equal(view.container.querySelector('.category-hero-image img').getAttribute('src'),'/category-hero.png');
    assert.equal(view.container.querySelector('.category-hero-image img').getAttribute('loading'),'eager');
    assert.equal(view.container.querySelector('.category-header').textContent.includes('Negocio de prueba'),false);
    await clickLink(view.container.querySelector('.back-link'));
    assert.equal(view.container.querySelector('.business-name').textContent,data.business.name);
  }finally{await view.close();}
});

test('categoría: categoría vacía, categoría inexistente y negocio inexistente',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async()=>response({...categoryData,products:[]}));
  const view=await mount('/test-menu/categoria/1');
  try{
    assert.ok(view.container.textContent.includes('Aún no hay productos en esta categoría.'));
    assert.equal(view.container.querySelector('.text-action').getAttribute('href'),'/test-menu');
    mock.mock.mockImplementation(async()=>response({error:'CATEGORY_NOT_FOUND'},404));
    await act(async()=>navigate('/test-menu/categoria/2'));
    assert.ok(view.container.textContent.includes('No encontramos esta categoría.'));
    assert.equal(view.container.querySelector('.text-action').getAttribute('href'),'/test-menu');
    mock.mock.mockImplementation(async()=>response({error:'BUSINESS_NOT_FOUND'},404));
    await act(async()=>navigate('/missing/categoria/2'));
    assert.ok(view.container.textContent.includes('No encontramos este menú.'));
    assert.equal(view.container.querySelector('a'),null);
  }finally{await view.close();}
});

test('categoría: error permite reintentar la API',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async()=>response({},503));
  const view=await mount('/test-menu/categoria/1');
  try{
    assert.ok(view.container.textContent.includes('No pudimos cargar esta categoría.'));
    mock.mock.mockImplementation(async()=>response(categoryData));
    await act(async()=>view.container.querySelector('button').click());
    assert.equal(view.container.querySelectorAll('.product-row').length,3);
    assert.equal(mock.mock.callCount(),2);
  }finally{await view.close();}
});

test('categoría: navegación rápida cancela peticiones e ignora respuestas anteriores',async t=>{
  const requests=[];
  t.mock.method(globalThis,'fetch',(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})));
  const view=await mount('/test-menu/categoria/1');
  try{
    await act(async()=>navigate('/test-menu/categoria/2'));
    assert.equal(requests[0].options.signal.aborted,true);
    await act(async()=>requests[1].resolve(response({...categoryData,category:{...categoryData.category,name:'Segunda categoría'}})));
    await act(async()=>requests[0].resolve(response(categoryData)));
    assert.equal(view.container.querySelector('h1').textContent,'Segunda categoría');
    assert.equal(document.title,'Segunda categoría | Negocio de prueba');
    await typeSearch(view.container,'limon');
    await act(async()=>navigate('/test-menu/categoria/3'));
    await act(async()=>requests[2].resolve(response(categoryData)));
    assert.equal(view.container.querySelector('input').value,'');
  }finally{await view.close();}
});

const productData = {
  ok: true, business: categoryData.business, category: categoryData.category,
  product: { ...categoryData.products[0], description: 'Descripción completa.\nSegundo párrafo con <strong>texto literal</strong>. '.repeat(8) },
  variants: [{ id: '9', name: '355 ml', price: '65.00', sort_order: 1 }, { id: '10', name: '473 ml', price: '75.50', sort_order: 1 }],
};
const detailPath = '/test-menu/categoria/9007199254740997/producto/21';

test('detalle: ruta, carga, imagen, información completa y presentaciones informativas', async t => {
  let resolve;
  t.mock.method(globalThis, 'fetch', () => new Promise(r => { resolve = r; }));
  const view = await mount(detailPath);
  try {
    assert.ok(view.container.querySelector('[aria-label="Cargando el producto"]'));
    assert.equal(view.container.querySelectorAll('.detail-skeleton-variant').length, 3);
    await act(async () => resolve(response(productData)));
    assert.equal(document.title, 'Michelada Especial | Negocio de prueba');
    assert.equal(view.container.querySelector('h1').textContent, productData.product.name);
    assert.equal(view.container.querySelector('.detail-description').textContent, productData.product.description);
    assert.equal(view.container.querySelector('.detail-description strong'), null);
    assert.ok(view.container.textContent.includes('Precio base $75.50'));
    assert.ok(view.container.textContent.includes('Recomendado'));
    assert.ok(view.container.textContent.includes('Disponible'));
    assert.deepEqual([...view.container.querySelectorAll('.detail-variants li')].map(el => el.textContent), ['355 ml$65', '473 ml$75.50']);
    assert.equal(view.container.querySelectorAll('button,input,select').length, 0);
    const image = view.container.querySelector('.detail-image img');
    assert.equal(image.alt, productData.product.name);
    assert.equal(image.getAttribute('loading'), 'eager');
    await act(async () => image.dispatchEvent(new window.Event('error')));
    assert.equal(view.container.querySelector('.detail-image img'), null);
    assert.equal(view.container.querySelector('.detail-image').textContent, 'ME');
    assert.equal(view.container.querySelector('.detail-back').getAttribute('href'), '/test-menu/categoria/9007199254740997');
  } finally { await view.close(); }
});

test('detalle: agotado accesible, descripción nula y ausencia de sección vacía', async t => {
  t.mock.method(globalThis, 'fetch', async () => response({ ...productData, product: categoryData.products[1], variants: [] }));
  const view = await mount(detailPath);
  try {
    assert.equal(view.container.querySelector('.detail-description'), null);
    assert.equal(view.container.querySelector('.detail-variants'), null);
    assert.equal(view.container.querySelector('.detail-image img'), null);
    assert.ok(view.container.querySelector('.detail-availability').textContent.includes('Agotado'));
    assert.equal(view.container.querySelector('.detail-price').textContent, '$80');
    assert.equal(view.container.querySelector('.recommended'), null);
    assert.ok(!view.container.textContent.includes('Disponible'));
  } finally { await view.close(); }
});

test('detalle: listado navega incluyendo agotados y volver funciona desde enlace directo', async t => {
  t.mock.method(globalThis, 'fetch', async url => response(url.includes('public-product') ? { ...productData, product: categoryData.products[1] } : categoryData));
  const view = await mount('/test-menu/categoria/9007199254740997');
  try {
    const link = view.container.querySelector('a.product-row.is-unavailable');
    assert.equal(link.getAttribute('href'), '/test-menu/categoria/9007199254740997/producto/22');
    await clickLink(link);
    assert.equal(view.container.querySelector('h1').textContent, 'Cubana');
    assert.ok(view.container.querySelector('.detail-variants'));
    await clickLink(view.container.querySelector('.detail-back'));
    assert.equal(view.container.querySelectorAll('.product-row').length, 3);
    await act(async () => navigate(detailPath));
    await clickLink(view.container.querySelector('.detail-back'));
    assert.equal(view.container.querySelector('h1').textContent, 'Preparadas');
  } finally { await view.close(); }
});

test('detalle: distingue producto, categoría y negocio inexistentes', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => response({ error: 'PRODUCT_NOT_FOUND' }, 404));
  const view = await mount(detailPath);
  try {
    assert.ok(view.container.textContent.includes('No encontramos este producto.'));
    assert.equal(view.container.querySelector('a').getAttribute('href'), '/test-menu/categoria/9007199254740997');
    mock.mock.mockImplementation(async () => response({ error: 'CATEGORY_NOT_FOUND' }, 404));
    await act(async () => navigate('/test-menu/categoria/2/producto/21'));
    assert.ok(view.container.textContent.includes('No encontramos esta categoría.'));
    assert.equal(view.container.querySelector('a').getAttribute('href'), '/test-menu');
    mock.mock.mockImplementation(async () => response({ error: 'BUSINESS_NOT_FOUND' }, 404));
    await act(async () => navigate('/missing/categoria/2/producto/21'));
    assert.ok(view.container.textContent.includes('No encontramos este menú.'));
    assert.equal(view.container.querySelector('a'), null);
  } finally { await view.close(); }
});

test('detalle: reintento vuelve a solicitar el producto', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => response({}, 503));
  const view = await mount(detailPath);
  try {
    assert.ok(view.container.textContent.includes('No pudimos cargar este producto.'));
    mock.mock.mockImplementation(async () => response(productData));
    await act(async () => view.container.querySelector('button').click());
    assert.equal(view.container.querySelector('h1').textContent, productData.product.name);
    assert.equal(mock.mock.callCount(), 2);
  } finally { await view.close(); }
});

test('detalle: cancela e ignora respuestas atrasadas y restaura título al desmontar', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  const view = await mount(detailPath);
  try {
    await act(async () => navigate('/test-menu/categoria/9007199254740997/producto/22'));
    assert.equal(requests[0].options.signal.aborted, true);
    await act(async () => requests[1].resolve(response({ ...productData, product: categoryData.products[1] })));
    await act(async () => requests[0].resolve(response(productData)));
    assert.equal(view.container.querySelector('h1').textContent, 'Cubana');
    assert.equal(document.title, 'Cubana | Negocio de prueba');
  } finally { await view.close(); }
  assert.equal(document.title, 'Menú digital');
});

const ownerIdentity = { ok: true, user: { id: '9007199254740999', name: 'Owner Demo', email: 'owner@test.test', role: 'OWNER' }, business: { name: 'Negocio privado', slug: 'private-menu', logo_url: null } };
const overviewData = { ok: true, business: ownerIdentity.business, summary: { categories: 4, products: 14, available_products: 13, unavailable_products: 1, featured_products: 3 } };
async function inputValue(container, selector, value) {
  const input = container.querySelector(selector);
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
async function submitLogin(container) {
  await act(async () => container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
}

test('admin: login accesible, 401 sin redirección, envío único y éxito', async t => {
  let resolveLogin;
  let requests = 0;
  const mock = t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('/auth/me')) return response({ error: 'UNAUTHORIZED' }, 401);
    if (url.includes('/auth/login')) { requests++; return requests === 1 ? response({ error: 'INVALID_CREDENTIALS' }, 401) : new Promise(resolve => { resolveLogin = resolve; }); }
    if (url.includes('/admin/overview')) return response(overviewData);
    assert.fail('Ruta inesperada');
  });
  t.mock.method(window.Storage.prototype, 'setItem', () => assert.fail('No almacenar tokens'));
  const view = await mount('/admin/login');
  try {
    assert.equal(view.container.querySelector('h1').textContent, 'Administra tu negocio');
    assert.equal(view.container.querySelector('input[type="email"]').autocomplete, 'email');
    assert.equal(view.container.querySelector('input[type="password"]').autocomplete, 'current-password');
    const pwd = window.crypto.randomUUID();
    await inputValue(view.container, 'input[type="email"]', 'owner@test.test');
    await inputValue(view.container, 'input[type="password"]', pwd);
    await submitLogin(view.container);
    assert.ok(view.container.textContent.includes('El correo o la contraseña no son correctos.'));
    assert.ok(view.container.querySelector('form'));
    await inputValue(view.container, 'input[type="password"]', pwd);
    await submitLogin(view.container);
    assert.equal(view.container.querySelector('button').disabled, true);
    assert.ok(view.container.textContent.includes('Iniciando sesión'));
    await submitLogin(view.container);
    assert.equal(requests, 2);
    await act(async () => resolveLogin(response(ownerIdentity)));
    assert.ok(view.container.textContent.includes('Hola, Owner Demo'));
    assert.ok(view.container.textContent.includes('Negocio privado'));
    const sent = mock.mock.calls.find(call => call.arguments[0].includes('/auth/login'));
    assert.equal(sent.arguments[1].credentials, 'same-origin');
    assert.ok(JSON.parse(sent.arguments[1].body).password === pwd);
    assert.deepEqual([...view.container.querySelectorAll('dd')].map(e => e.textContent), ['4', '14', '13', '1', '3']);
  } finally { await view.close(); }
});

test('admin: protege ruta sin flash y restaura sesión en montaje nuevo', async t => {
  let resolveSession;
  const mock = t.mock.method(globalThis, 'fetch', url => url.includes('/auth/me') ? new Promise(resolve => { resolveSession = resolve; }) : Promise.resolve(response(overviewData)));
  const view = await mount('/admin');
  try {
    assert.ok(view.container.textContent.includes('Comprobando sesión'));
    assert.equal(view.container.querySelector('.admin-dashboard'), null);
    await act(async () => resolveSession(response({}, 401)));
    assert.ok(view.container.querySelector('form'));
  } finally { await view.close(); }
  mock.mock.mockImplementation(async url => response(url.includes('/auth/me') ? ownerIdentity : overviewData));
  const restored = await mount('/admin');
  try {
    assert.ok(restored.container.textContent.includes('Hola, Owner Demo'));
    assert.equal(document.title, 'Inicio | Negocio privado');
    const link = restored.container.querySelector('.admin-public-link');
    assert.equal(link.getAttribute('href'), '/private-menu'); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
    assert.ok(!mock.mock.calls.some(call => call.arguments[0].includes('public-menu')));
  } finally { await restored.close(); }
});

test('admin: sesión válida en login redirige y logout ejecuta servidor', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async url => response(url.includes('/auth/me') ? ownerIdentity : url.includes('/auth/logout') ? { ok: true } : overviewData));
  const view = await mount('/admin/login');
  try {
    assert.ok(view.container.querySelector('.admin-dashboard'));
    await act(async () => view.container.querySelector('.admin-logout').click());
    assert.ok(view.container.querySelector('form'));
    assert.ok(mock.mock.calls.some(c => c.arguments[0] === '/api/auth/logout' && c.arguments[1].method === 'POST'));
  } finally { await view.close(); }
});

test('admin: 401 overview limpia sesión sin loop de redirecciones', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async url => url.includes('/auth/me') ? response(ownerIdentity) : response({}, 401));
  const view = await mount('/admin');
  try { assert.ok(view.container.querySelector('form')); assert.equal(mock.mock.callCount(), 2); }
  finally { await view.close(); }
});

test('admin: error de sesión tiene reintento, resumen vacío y error recuperable', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => response({}, 503));
  const view = await mount('/admin');
  try {
    assert.ok(view.container.textContent.includes('No pudimos comprobar tu sesión.'));
    mock.mock.mockImplementation(async url => url.includes('/auth/me') ? response(ownerIdentity) : response({}, 503));
    await act(async () => view.container.querySelector('button').click());
    assert.ok(view.container.textContent.includes('No pudimos cargar el resumen.'));
    mock.mock.mockImplementation(async () => response({ ...overviewData, summary: Object.fromEntries(Object.keys(overviewData.summary).map(key => [key, 0])) }));
    await act(async () => view.container.querySelector('.admin-secondary').click());
    assert.deepEqual([...view.container.querySelectorAll('dd')].map(e => e.textContent), ['0', '0', '0', '0', '0']);
  } finally { await view.close(); }
});

test('admin: logout fallido conserva sesión y permite reintentar', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('/auth/logout') ? response({}, 503) : response(url.includes('/auth/me') ? ownerIdentity : overviewData));
  const view = await mount('/admin');
  try {
    await act(async () => view.container.querySelector('.admin-logout').click());
    assert.ok(view.container.querySelector('.admin-dashboard'));
    assert.ok(view.container.textContent.includes('No pudimos cerrar la sesión.'));
    assert.equal(view.container.querySelector('.admin-logout').disabled, false);
  } finally { await view.close(); }
});

test('fase 8 frontend: ruta protegida renderiza QR, logo, warning local y copia enlace',async t=>{
 const qr={ok:true,qr:{public_url:'http://192.168.1.91:8892/private-menu',slug:'private-menu',business_name:'Negocio privado',logo_url:'/logo-qr.png',theme_color:'#4DA9CE',is_local_url:true}};
 const copied=[];
 Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async value=>copied.push(value)}});
 t.mock.method(globalThis,'fetch',async url=>url.includes('/auth/me')?response(ownerIdentity):url.includes('/admin/qr')?response(qr):assert.fail(`Ruta inesperada ${url}`));
 const view=await mount('/admin/qr');try{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))});
  assert.equal(view.container.querySelector('h1').textContent,'Tu menú está listo para compartir.');
  assert.ok(view.container.querySelector('a[href="/admin/qr"]').classList.contains('active'));
  assert.equal(view.container.querySelector('.qr-public-url').textContent,qr.qr.public_url);
  assert.ok(view.container.querySelector('.qr-code-image').getAttribute('src').startsWith('data:image/svg+xml'));
  assert.equal(view.container.querySelector('.qr-center-logo img').getAttribute('src'),'/logo-qr.png');
  assert.ok(view.container.textContent.includes('solo para pruebas en tu red local'));
  await act(async()=>view.container.querySelector('.qr-actions button').click());
  assert.deepEqual(copied,[qr.qr.public_url]);
  assert.ok(view.container.textContent.includes('Enlace copiado.'));
  const menu=view.container.querySelector(`a[href="${qr.qr.public_url}"]`);
  assert.equal(menu.target,'_blank');assert.equal(menu.rel,'noopener noreferrer');
 }finally{delete window.navigator.clipboard;await view.close()}
});

test('fase 8 frontend: QR sin logo descarga PNG de alta resolución',async t=>{
 const qr={ok:true,qr:{public_url:'https://menu.example.com/private-menu',slug:'private-menu',business_name:'Negocio privado',logo_url:null,theme_color:null,is_local_url:false}};
 t.mock.method(globalThis,'fetch',async url=>url.includes('/auth/me')?response(ownerIdentity):url.includes('/admin/qr')?response(qr):assert.fail(`Ruta inesperada ${url}`));
 const context={createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),clearRect(){},putImageData(){},save(){},restore(){},beginPath(){},arc(){},fill(){},clip(){},drawImage(){},fillRect(){},measureText:value=>({width:value.length*10}),fillText(){}};
 t.mock.method(window.HTMLCanvasElement.prototype,'getContext',function(){context.canvas=this;return context});
 t.mock.method(window.HTMLCanvasElement.prototype,'toDataURL',type=>`data:${type};base64,QRPNG`);
 let downloaded=null;
 t.mock.method(window.HTMLAnchorElement.prototype,'click',function(){downloaded={href:this.href,filename:this.download}});
 const view=await mount('/admin/qr');try{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))});
  assert.equal(view.container.querySelector('.qr-center-logo'),null);
  assert.equal(view.container.querySelector('.qr-local-warning'),null);
  assert.ok(view.container.textContent.includes('Escanea para ver nuestro menú'));
  const button=[...view.container.querySelectorAll('.qr-actions button')].find(item=>item.textContent==='Descargar PNG');
  assert.equal(button.disabled,false);
  await act(async()=>button.click());
  assert.equal(downloaded.filename,'qr-private-menu.png');
  assert.ok(downloaded.href.startsWith('data:image/png'));
  assert.ok(view.container.textContent.includes('QR descargado.'));
 }finally{await view.close()}
});

test('fase 8 frontend: configuración ausente y 401 tienen estados seguros',async t=>{
 const mock=t.mock.method(globalThis,'fetch',async url=>url.includes('/auth/me')?response(ownerIdentity):response({error:'PUBLIC_URL_UNAVAILABLE'},503));
 const view=await mount('/admin/qr');try{
  assert.ok(view.container.textContent.includes('No se ha configurado la URL pública del menú.'));
  assert.equal(view.container.querySelector('.qr-code-image'),null);
 }finally{await view.close()}
 mock.mock.mockImplementation(async url=>url.includes('/auth/me')?response(ownerIdentity):response({error:'UNAUTHORIZED'},401));
 const unauthorized=await mount('/admin/qr');try{assert.ok(unauthorized.container.querySelector('form'));}finally{await unauthorized.close()}
});

const adminCategories = [{ id: '1', name: 'Cervezas', image_url: null, sort_order: 1, active: true }, { id: '2', name: 'Ocultas', image_url: null, sort_order: 2, active: false }];
const adminProducts = [{ id: '10', category_id: '1', name: 'Modelo Especial', description: null, price: '50.00', image_url: null, active: true, available: true, featured: true, sort_order: 1, category: { id: '1', name: 'Cervezas' } }, { id: '11', category_id: '2', name: 'Producto oculto', description: '', price: '75.50', image_url: null, active: false, available: false, featured: false, sort_order: 1, category: { id: '2', name: 'Ocultas' } }];

test('fase 6 frontend: navegación Menú, tabs, filtros y toggle rápido agotado', async t => {
  const mock=t.mock.method(globalThis,'fetch',async(url,options={})=>{
    if(url.includes('/auth/me'))return response(ownerIdentity);
    if(url.includes('/admin/overview'))return response(overviewData);
    if(url.endsWith('/admin/categories'))return response({ok:true,categories:adminCategories});
    if(url.endsWith('/admin/products')&&options.method!=='PATCH')return response({ok:true,products:adminProducts});
    if(url.includes('/admin/products?')&&options.method==='PATCH')return response({ok:true,product:{...adminProducts[0],available:false}});
    assert.fail(`Ruta inesperada ${url}`);
  });
  const view=await mount('/admin');try{
    await clickLink([...view.container.querySelectorAll('a')].find(a=>a.textContent==='Menú'));
    assert.ok(view.container.textContent.includes('Administra tu menú'));
    assert.equal(view.container.querySelectorAll('.admin-list-item').length,2);
    await act(async()=>view.container.querySelector('[role="tab"][aria-selected="false"]').click());
    assert.ok(view.container.textContent.includes('Modelo Especial'));
    await inputValue(view.container,'input[type="search"]','oculto');
    assert.equal(view.container.querySelectorAll('.admin-product-item').length,1);
    await inputValue(view.container,'input[type="search"]','');
    await act(async()=>[...view.container.querySelectorAll('.admin-product-item button')].find(b=>b.textContent==='Disponible').click());
    assert.ok(view.container.textContent.includes('Agotado'));
    const patch=mock.mock.calls.find(c=>String(c.arguments[0]).includes('product_id=10'));
    assert.deepEqual(JSON.parse(patch.arguments[1].body),{available:false});
  }finally{await view.close()}
});

test('fase 6 frontend: crear y editar categoría con lenguaje no técnico',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async(url,options={})=>{
    if(url.includes('/auth/me'))return response(ownerIdentity);
    if(url.endsWith('/admin/categories')&&options.method==='POST')return response({ok:true,category:{id:'3',name:'Comida',active:true}},201);
    if(url.endsWith('/admin/categories'))return response({ok:true,categories:adminCategories});
    if(url.endsWith('/admin/products'))return response({ok:true,products:[]});
    assert.fail(`Ruta inesperada ${url}`)
  });
  const view=await mount('/admin/menu/categorias/nueva');try{
    assert.equal(view.container.querySelector('h1').textContent,'Nueva categoría');
    assert.ok(view.container.textContent.includes('Visible en el menú'));
    assert.ok(!view.container.textContent.includes('business_id'));
    await inputValue(view.container,'input:not([type="checkbox"])','Comida');
    await act(async()=>view.container.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
    assert.ok(view.container.textContent.includes('Cambios guardados'));
    const sent=mock.mock.calls.find(c=>c.arguments[1]?.method==='POST');assert.deepEqual(JSON.parse(sent.arguments[1].body),{name:'Comida',active:true});
  }finally{await view.close()}
});

test('fase 6 frontend: formulario producto y presentaciones activas/inactivas',async t=>{
 const detail={ok:true,product:adminProducts[0],category:adminProducts[0].category,variants:[{id:'20',product_id:'10',name:'Chico',price:'30.00',active:false,sort_order:1},{id:'21',product_id:'10',name:'Grande',price:'50.00',active:true,sort_order:2}]};
 t.mock.method(globalThis,'fetch',async(url)=>url.includes('/auth/me')?response(ownerIdentity):url.includes('/admin/categories')?response({ok:true,categories:adminCategories}):url.includes('/admin/product?')?response(detail):assert.fail(`Ruta inesperada ${url}`));
 const view=await mount('/admin/menu/productos/10/editar');try{
  assert.equal(view.container.querySelector('h1').textContent,'Editar producto');
  assert.equal(view.container.querySelector('textarea').value,'');
  assert.deepEqual([...view.container.querySelectorAll('.admin-toggle span')].slice(0,3).map(x=>x.textContent),['Visible en el menú','Disponible','Recomendado']);
  assert.ok(view.container.textContent.includes('Chico$30 · Oculta'));
  assert.ok(view.container.textContent.includes('Grande$50 · Visible'));
  assert.ok(view.container.textContent.includes('Agregar presentación'));
  assert.equal(view.container.querySelector('[inputmode="decimal"]').value,'50.00');
 }finally{await view.close()}
});

test('fase 7 frontend: promociones públicas y color de marca seguro',async t=>{
 const promoted={...data,business:{...data.business,theme_color:'#F445C8'},promotions:[
  {id:'7',title:'Combo de prueba',description:'Descripción promocional',price:'99.50',image_url:null},
  {id:'8',title:'2x1 en cervezas',description:null,price:null,image_url:'/promo.jpg'},
  {id:'9',title:'Cubeta y botana',description:'Incluye una botana de la casa.',price:'199.00',image_url:null},
 ]};
 t.mock.method(globalThis,'fetch',async()=>response(promoted));
 const view=await mount('/test-menu');try{
  assert.equal(view.container.querySelector('.public-menu-page').style.getPropertyValue('--brand-color'),'#F445C8');
  assert.ok(view.container.textContent.includes('Combo de prueba'));
  assert.ok(view.container.textContent.includes('$99.50'));
  assert.equal(view.container.querySelectorAll('.promotion-card').length,3);
  assert.equal(view.container.querySelectorAll('.promotion-price').length,2);
  assert.ok(!view.container.textContent.includes('$0'));
  assert.equal(view.container.querySelector('.promotion-carousel').getAttribute('aria-label'),'Promociones disponibles');
  assert.equal(view.container.querySelectorAll('.promotion-card.is-fallback').length,0);
  assert.equal(view.container.querySelectorAll('.promotion-card .menu-image.is-fallback').length,2);
  assert.equal(view.container.querySelector('.promotion-card img').getAttribute('loading'),'lazy');
  const promo=view.container.querySelector('.promotion-section');const categories=view.container.querySelector('.categories-section');
  assert.ok(promo.compareDocumentPosition(categories)&window.Node.DOCUMENT_POSITION_FOLLOWING);
 }finally{await view.close()}
});

test('promoción única mantiene el carrusel continuo sin duplicados accesibles',async t=>{
 const promoted={...data,business:{...data.business,promotion_cover_url:'/promotion-cover.png'},promotions:[
  {id:'7',title:'Promoción única',description:null,price:null,image_url:null},
 ]};
 t.mock.method(globalThis,'fetch',async()=>response(promoted));
 const view=await mount('/test-menu');try{
  const carousel=view.container.querySelector('.promotion-carousel');
  assert.ok(carousel.classList.contains('is-looping'));
  assert.equal(carousel.querySelectorAll('.promotion-card').length,6);
  assert.equal(carousel.querySelectorAll('.promotion-cover-card').length,3);
  assert.equal(carousel.querySelector('.promotion-cover-card img').getAttribute('src'),'/promotion-cover.png');
  assert.equal(carousel.querySelectorAll('.promotion-card[aria-hidden="true"]').length,5);
  assert.equal(carousel.querySelector('.promotion-card:not([aria-hidden]) h3').textContent,'Promoción única');
 }finally{await view.close()}
});

test('fase 7 frontend: listado admin muestra miniaturas, precio opcional y estados',async t=>{
 const promotions={ok:true,promotion_cover_url:'/promotion-cover.jpg',promotions:[
  {id:'7',title:'Con imagen',description:null,price:'199.00',image_url:'/promo.jpg',starts_at:null,ends_at:null,active:true,sort_order:1},
  {id:'8',title:'Sin imagen',description:null,price:null,image_url:null,starts_at:'2099-01-01T00:00:00.000Z',ends_at:null,active:true,sort_order:2},
 ]};
 t.mock.method(globalThis,'fetch',async url=>url.includes('/auth/me')?response(ownerIdentity):url.endsWith('/admin/promotions')?response(promotions):assert.fail(`Ruta inesperada ${url}`));
 const view=await mount('/admin/promociones');try{
  assert.equal(view.container.querySelectorAll('.admin-promotion-item').length,2);
  assert.equal(view.container.querySelectorAll('.admin-promotion-thumb').length,2);
  assert.equal(view.container.querySelectorAll('.admin-promotion-thumb.is-fallback').length,1);
  assert.ok(view.container.textContent.includes('Portada del carrusel de promociones'));
  assert.equal(view.container.querySelector('.media-uploader img').getAttribute('src'),'/promotion-cover.jpg');
  assert.ok(view.container.textContent.includes('$199 · Activa'));
  assert.ok(view.container.textContent.includes('Programada'));
  assert.ok(!view.container.textContent.includes('Sin precio'));
 }finally{await view.close()}
});

test('fase 7 frontend: crear promoción continúa a imagen y permite quitarla',async t=>{
 const saved={id:'7',title:'Promo nueva',description:null,price:null,image_url:'/promo.jpg',starts_at:null,ends_at:null,active:true,sort_order:1};
 const mock=t.mock.method(globalThis,'fetch',async(url,options={})=>{
  if(url.includes('/auth/me'))return response(ownerIdentity);
  if(url.endsWith('/admin/promotions')&&options.method==='POST')return response({ok:true,promotion:saved},201);
  if(url.includes('/admin/promotion?promotion_id=7'))return response({ok:true,promotion:saved});
  if(url.endsWith('/admin/media/remove')&&options.method==='POST')return response({ok:true,media:{id:'7',image_url:null}});
  assert.fail(`Ruta inesperada ${url}`);
 });
 const view=await mount('/admin/promociones/nueva');try{
  await inputValue(view.container,'input[required]','Promo nueva');
  await act(async()=>view.container.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(view.container.querySelector('h1').textContent,'Editar promoción');
  assert.ok(view.container.textContent.includes('Cambiar imagen'));
  const mediaButtons=[...view.container.querySelectorAll('.media-actions button')];
  assert.ok(mediaButtons.every(button=>button.type==='button'));
  await act(async()=>mediaButtons.find(button=>button.textContent==='Quitar imagen').click());
  assert.ok(view.container.textContent.includes('Imagen eliminada.'));
  assert.ok(view.container.textContent.includes('Sin imagen'));
  const createCall=mock.mock.calls.find(call=>call.arguments[1]?.method==='POST'&&call.arguments[0].endsWith('/admin/promotions'));
  assert.deepEqual(Object.keys(JSON.parse(createCall.arguments[1].body)).sort(),['active','description','ends_at','price','starts_at','title']);
  const removeCall=mock.mock.calls.find(call=>call.arguments[0].endsWith('/admin/media/remove'));
  assert.deepEqual(JSON.parse(removeCall.arguments[1].body),{target:'promotion',entity_id:'7'});
 }finally{await view.close()}
});

test('fase 7 frontend: Mi negocio conserva slug y muestra gestión de marca',async t=>{
 const business={ok:true,business:{id:'1',name:'Negocio privado',slug:'private-menu',logo_url:null,cover_url:null,description:'Hola',address:'Centro',phone:'555',theme_color:'#4DA9CE'}};
 t.mock.method(globalThis,'fetch',async url=>url.includes('/auth/me')?response({...ownerIdentity,business:{...ownerIdentity.business,theme_color:'#4DA9CE'}}):url.includes('/admin/business')?response(business):assert.fail(`Ruta inesperada ${url}`));
 const view=await mount('/admin/mi-negocio');try{
  assert.equal(view.container.querySelector('h1').textContent,'Mi negocio');
  assert.equal(view.container.querySelector('input[disabled]').value,'private-menu');
  assert.ok(view.container.textContent.includes('El slug no se puede modificar.'));
  assert.deepEqual([...view.container.querySelectorAll('.admin-header nav > a:not(.admin-public-link)')].map(x=>x.textContent),['Inicio','Menú','Promociones','Mi negocio','Código QR']);
  assert.equal(view.container.querySelector('.admin-dashboard').style.getPropertyValue('--brand-color'),'#4DA9CE');
 }finally{await view.close()}
});
