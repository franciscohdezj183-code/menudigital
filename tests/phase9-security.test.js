import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.js';
import { checkSameOrigin, signSession } from '../netlify/lib/auth.js';
import { LOGIN_LIMIT } from '../netlify/lib/login-rate-limit.js';
import { createLoginHandler } from '../netlify/functions/auth-login.js';
import { createAdminBusinessHandler } from '../netlify/functions/admin-business.js';
import { createAdminCategoriesHandler } from '../netlify/functions/admin-categories.js';
import { createCategoriesReorderHandler } from '../netlify/functions/admin-categories-reorder.js';
import { createAdminProductHandler } from '../netlify/functions/admin-product.js';
import { createProductsReorderHandler } from '../netlify/functions/admin-products-reorder.js';
import { createAdminVariantsHandler } from '../netlify/functions/admin-variants.js';
import { createVariantsReorderHandler } from '../netlify/functions/admin-variants-reorder.js';
import { createAdminPromotionHandler } from '../netlify/functions/admin-promotion.js';
import { createPromotionsReorderHandler } from '../netlify/functions/admin-promotions-reorder.js';
import { createMediaSignHandler } from '../netlify/functions/admin-media-sign.js';
import { createMediaCompleteHandler } from '../netlify/functions/admin-media-complete.js';
import { createMediaRemoveHandler } from '../netlify/functions/admin-media-remove.js';
import { createAdminQrHandler } from '../netlify/functions/admin-qr.js';
import { hashPassword } from '../netlify/lib/passwords.js';
import { mediaTarget, verifyUploadAuthorization, verifiedImage } from '../netlify/lib/cloudinary.js';
import { uploadAdminImage } from '../src/services/api.js';

const silent = () => {};
const secret = randomBytes(48).toString('hex');
const env = { NODE_ENV: 'development', AUTH_SECRET: secret, PUBLIC_SITE_URL: 'https://menu.example.test', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'cloud-secret' };
const adapter = db => ({ query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1) });
const payload = response => JSON.parse(response.body);
const request = (method, token, body, queryStringParameters = {}) => ({
  httpMethod: method,
  headers: { host: 'localhost:8888', origin: 'http://localhost:8888', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { cookie: `menu_session=${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
  queryStringParameters,
});

test('FASE 9: CSRF exige el origen canónico en producción y limita desarrollo a redes locales', () => {
  const production = { NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://menu.example.test' };
  assert.doesNotThrow(() => checkSameOrigin({ httpMethod: 'POST', headers: { origin: 'https://menu.example.test' } }, production));
  assert.doesNotThrow(() => checkSameOrigin({ httpMethod: 'PATCH', headers: { referer: 'https://menu.example.test/admin/menu' } }, production));
  assert.throws(() => checkSameOrigin({ httpMethod: 'POST', headers: {} }, production), error => error.status === 403);
  assert.throws(() => checkSameOrigin({ httpMethod: 'POST', headers: { origin: 'https://evil.test' } }, production), error => error.status === 403);
  assert.throws(() => checkSameOrigin({ httpMethod: 'POST', headers: { origin: 'https://menu.example.test', 'sec-fetch-site': 'cross-site' } }, production), error => error.status === 403);
  assert.doesNotThrow(() => checkSameOrigin({ httpMethod: 'DELETE', headers: { origin: 'http://192.168.1.20:8888' } }, { NODE_ENV: 'development' }));
  assert.doesNotThrow(() => checkSameOrigin({ httpMethod: 'GET', headers: { origin: 'https://evil.test' } }, production));
});

test('FASE 9: rate limit de login persiste en PostgreSQL sin guardar correo ni IP', async () => {
  const db = new PGlite();
  try {
    await migrate(adapter(db), undefined, silent);
    await db.exec("INSERT INTO businesses(id,name,slug) OVERRIDING SYSTEM VALUE VALUES(1,'A','a')");
    const password = 'Password9-secure';
    const hash = await hashPassword(password);
    await db.query("INSERT INTO users(id,business_id,name,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES(1,1,'Owner','owner@test.local',$1,'OWNER')", [hash]);
    const run = async (sql, params) => (await db.query(sql, params)).rows;
    const login = createLoginHandler(run, env, silent);
    const bad = request('POST', null, { email: 'owner@test.local', password: 'Wrong-password9' });
    bad.headers['x-nf-client-connection-ip'] = '203.0.113.10';
    for (let attempt = 1; attempt < LOGIN_LIMIT; attempt++) assert.equal((await login(bad)).statusCode, 401);
    assert.equal((await login(bad)).statusCode, 429);
    assert.equal((await login(bad)).statusCode, 429);
    const rows = (await db.query('SELECT key_hash FROM login_rate_limits')).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => /^[a-f0-9]{64}$/.test(row.key_hash)));
    assert.ok(!JSON.stringify(rows).includes('owner@test.local') && !JSON.stringify(rows).includes('203.0.113.10'));
  } finally { await db.close(); }
});

test('FASE 9: Cloudinary exige autorización reciente y rechaza bombas de dimensiones', () => {
  const client = { utils: { api_sign_request: () => 'signed-value' } };
  const config = { api_secret: 'cloud-secret' };
  const target = mediaTarget('product', '7', '1');
  const publicId = `${target.folder}55555555-5555-4555-8555-555555555555`;
  const now = 2_000_000_000;
  assert.doesNotThrow(() => verifyUploadAuthorization(client, config, target, publicId, now - 10, 'signed-value', now));
  assert.throws(() => verifyUploadAuthorization(client, config, target, publicId, now - 601, 'signed-value', now));
  assert.throws(() => verifyUploadAuthorization(client, config, target, publicId, now, 'tampered', now));
  const base = { resource_type: 'image', type: 'upload', public_id: publicId, format: 'webp', bytes: 1200, width: 1200, height: 800, secure_url: `https://res.cloudinary.com/demo/image/upload/${publicId}.webp` };
  assert.equal(verifiedImage(base, target, publicId), base.secure_url);
  assert.throws(() => verifiedImage({ ...base, width: 12000, height: 12000 }, target, publicId));
  assert.throws(() => verifiedImage({ ...base, format: 'svg' }, target, publicId));
});

test('FASE 9: matriz adversarial bloquea recursos de Empresa B para OWNER A', async () => {
  const db = new PGlite();
  try {
    await migrate(adapter(db), undefined, silent);
    await db.exec(`
      INSERT INTO businesses(id,name,slug) OVERRIDING SYSTEM VALUE VALUES(1,'Empresa A','empresa-a'),(2,'Empresa B','empresa-b');
      INSERT INTO users(id,business_id,name,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES(1,1,'Owner A','a@test.local','hash','OWNER'),(2,2,'Owner B','b@test.local','hash','OWNER');
      INSERT INTO categories(id,business_id,name) OVERRIDING SYSTEM VALUE VALUES(1,1,'A'),(2,2,'B');
      INSERT INTO products(id,business_id,category_id,name,price) OVERRIDING SYSTEM VALUE VALUES(1,1,1,'A',10),(2,2,2,'B',20);
      INSERT INTO product_variants(id,business_id,product_id,name,price) OVERRIDING SYSTEM VALUE VALUES(1,1,1,'A',10),(2,2,2,'B',20);
      INSERT INTO promotions(id,business_id,title) OVERRIDING SYSTEM VALUE VALUES(1,1,'A'),(2,2,'B');
    `);
    const run = async (sql, params) => (await db.query(sql, params)).rows;
    const token = await signSession({ id: '1', business_id: '1', role: 'OWNER' }, env);
    const foreign = [
      createAdminCategoriesHandler(run, env, silent)(request('PATCH', token, { name: 'Ataque' }, { category_id: '2' })),
      createAdminProductHandler(run, env, silent)(request('GET', token, undefined, { product_id: '2' })),
      createAdminVariantsHandler(run, env, silent)(request('PATCH', token, { name: 'Ataque' }, { variant_id: '2' })),
      createAdminPromotionHandler(run, env, silent)(request('GET', token, undefined, { promotion_id: '2' })),
      createMediaSignHandler(run, env, silent)(request('POST', token, { target: 'category', entity_id: '2' })),
      createMediaCompleteHandler(run, env, silent, () => assert.fail('Cloudinary no debe consultarse'))(request('POST', token, { target: 'product', entity_id: '2', public_id: 'digital-menu/1/products/x', upload_timestamp: Math.floor(Date.now() / 1000), upload_signature: 'x' })),
      createMediaRemoveHandler(run, env, silent, () => assert.fail('Cloudinary no debe consultarse'))(request('POST', token, { target: 'promotion', entity_id: '2' })),
    ];
    for (const response of await Promise.all(foreign)) assert.equal(response.statusCode, 404);
    const reorders = await Promise.all([
      createCategoriesReorderHandler(run, env, silent)(request('POST', token, { category_ids: ['2'] })),
      createProductsReorderHandler(run, env, silent)(request('POST', token, { category_id: '1', product_ids: ['2'] })),
      createVariantsReorderHandler(run, env, silent)(request('POST', token, { product_id: '1', variant_ids: ['2'] })),
      createPromotionsReorderHandler(run, env, silent)(request('POST', token, { promotion_ids: ['2'] })),
    ]);
    assert.ok(reorders.every(response => response.statusCode === 400));
    const business = payload(await createAdminBusinessHandler(run, env, silent)(request('GET', token, undefined, { business_id: '2' }))).business;
    assert.equal(business.slug, 'empresa-a');
    const qr = payload(await createAdminQrHandler(run, env, silent)(request('GET', token, undefined, { business_id: '2', slug: 'empresa-b' }))).qr;
    assert.equal(qr.public_url, 'https://menu.example.test/empresa-a');
    assert.equal((await createAdminCategoriesHandler(run, env, silent)(request('POST', token, { name: 'X', business_id: '2' }))).statusCode, 400);
  } finally { await db.close(); }
});

test('FASE 9: frontend y Netlify conservan invariantes estáticas de seguridad', async () => {
  const [source, api, config] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../netlify.toml', import.meta.url), 'utf8'),
  ]);
  assert.ok(!source.includes('dangerouslySetInnerHTML'));
  assert.ok(!api.includes('localStorage') && !api.includes('sessionStorage'));
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /X-Frame-Options = "DENY"/);
  assert.match(config, /Content-Security-Policy/);
  assert.ok(!config.includes("'unsafe-eval'"));
  assert.ok(!config.includes('Access-Control-Allow-Origin'));
});

test('FASE 9: un 401 externo de Cloudinary no se confunde con sesión expirada', async t => {
  const originalFetch = globalThis.fetch;
  const originalFile = globalThis.File;
  class TestFile extends Blob { constructor(parts, name, options) { super(parts, options); this.name = name; this.lastModified = Date.now(); } }
  globalThis.File = TestFile;
  let call = 0;
  globalThis.fetch = async url => {
    call++;
    if (String(url).startsWith('/api/admin/media/sign')) return new Response(JSON.stringify({ ok: true, upload: { cloud_name: 'demo', api_key: 'key', timestamp: 1, signature: 'signed', folder: 'folder', public_id: 'id', allowed_formats: 'jpg,png,webp' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ error: { message: 'external unauthorized' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; globalThis.File = originalFile; });
  const file = new TestFile(['image'], 'photo.jpg', { type: 'image/jpeg' });
  await assert.rejects(uploadAdminImage(file, 'product', '1'), error => error.status === 502 && error.code === 'MEDIA_UPLOAD_FAILED');
  assert.equal(call, 2);
});
