import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.js';
import { seedDevelopment } from '../scripts/seed-dev.js';
import { createPublicMenuHandler } from '../netlify/functions/public-menu.js';
import { getPublicMenu } from '../src/services/api.js';
import { safeImageUrl, initials } from '../src/utils/images.js';

const silent = () => {};
const event = (slug, httpMethod = 'GET') => ({ httpMethod, queryStringParameters: { slug } });
const adapter = db => ({ query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1) });

test('public-menu rechaza slugs inválidos, repetidos y métodos sin consultar la base', async () => {
  const handler = createPublicMenuHandler(() => assert.fail('No debe consultar PostgreSQL'), silent);
  for (const slug of [undefined, null, '', ' ', '../a', 'a_b', 'a--b', "x' OR 1=1--", 'x'.repeat(121), ['a'], 'café']) {
    const result = await handler(event(slug));
    assert.equal(result.statusCode, 400);
    assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'INVALID_REQUEST' });
  }
  assert.equal((await handler({ ...event('demo'), multiValueQueryStringParameters: { slug: ['demo', 'other'] } })).statusCode, 400);
  const result = await handler(event('demo', 'POST'));
  assert.equal(result.statusCode, 405);
  assert.equal(result.headers.Allow, 'GET');
});

test('public-menu usa PostgreSQL: actividad, orden estable, campos públicos y aislamiento', async () => {
  const db = new PGlite();
  try {
    await migrate(adapter(db), undefined, silent);
    await db.exec(`
      INSERT INTO businesses (name, slug, active) VALUES ('First', 'first', TRUE), ('Second', 'second', TRUE), ('Hidden', 'hidden', FALSE), ('Empty', 'empty', TRUE);
      INSERT INTO categories (business_id, name, sort_order, active) VALUES
        (1, 'Later', 3, TRUE), (1, 'Tie first', 1, TRUE), (1, 'Tie second', 1, TRUE),
        (1, 'Inactive category', 0, FALSE), (2, 'Another business', 0, TRUE), (3, 'Hidden business category', 0, TRUE);
    `);
    const calls = [];
    const handler = createPublicMenuHandler(async (sql, params) => {
      calls.push({ sql, params });
      return (await db.query(sql, params)).rows;
    }, silent);
    for (const slug of ['missing', 'hidden']) {
      assert.equal((await handler(event(slug))).statusCode, 404);
    }
    const result = await handler(event('  FIRST  '));
    assert.equal(result.statusCode, 200);
    const data = JSON.parse(result.body);
    assert.deepEqual(Object.keys(data.business).sort(), ['address', 'cover_url', 'description', 'logo_url', 'name', 'phone', 'promotion_cover_url', 'slug', 'theme_color']);
    assert.deepEqual(data.categories.map(category => category.name), ['Tie first', 'Tie second', 'Later']);
    assert.deepEqual(Object.keys(data.categories[0]).sort(), ['id', 'image_url', 'name', 'sort_order']);
    assert.equal(typeof data.categories[0].id, 'string');
    assert.deepEqual(calls.at(-3).params, ['first']);
    assert.ok(calls.at(-3).sql.includes('$1'));
    assert.equal(String(calls.at(-1).params[0]), '1');
    assert.ok(!JSON.stringify(data).includes('password'));
    assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
    assert.deepEqual(JSON.parse((await handler(event('empty'))).body).categories, []);
    assert.deepEqual(JSON.parse((await handler(event('second'))).body).categories.map(c => c.name), ['Another business']);
  } finally { await db.close(); }
});

test('public-menu sanitiza errores de cualquiera de las dos consultas', async () => {
  for (const failAt of [1, 2]) {
    let count = 0;
    const logs = [];
    const handler = createPublicMenuHandler(async () => {
      if (++count === failAt) throw new Error('postgresql://private:secret@internal/db SQL stack');
      return [{ id: '1' }];
    }, (context) => logs.push(context));
    const result = await handler(event('demo'));
    assert.equal(result.statusCode, 503);
    assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'SERVICE_UNAVAILABLE' });
    assert.deepEqual(logs, ['public-menu.database']);
  }
});

test('seed de desarrollo es transaccional, repetible y no toca un slug existente', async () => {
  const db = new PGlite();
  try {
    const client = adapter(db);
    await migrate(client, undefined, silent);
    await assert.rejects(seedDevelopment(client, { NODE_ENV: 'production' }), /NODE_ENV=development/);
    await assert.rejects(seedDevelopment(client, { NODE_ENV: 'development', CONTEXT: 'production' }), /NODE_ENV=development/);
    assert.equal(await seedDevelopment(client, { NODE_ENV: 'development' }), true);
    await db.exec("UPDATE businesses SET description = 'Custom' WHERE slug = 'negocio-demo'");
    assert.equal(await seedDevelopment(client, { NODE_ENV: 'development' }), false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM categories')).rows[0].n, 4);
    assert.equal((await db.query('SELECT description FROM businesses')).rows[0].description, 'Custom');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('getPublicMenu codifica parámetros y propaga la cancelación', async t => {
  const controller = new AbortController();
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{"ok":true}'));
  await getPublicMenu('demo&slug=other', { signal: controller.signal });
  assert.equal(mock.mock.calls[0].arguments[0], '/api/public-menu?slug=demo%26slug%3Dother');
  assert.equal(mock.mock.calls[0].arguments[1].signal, controller.signal);
});

test('imágenes: fallbacks, protocolos seguros e iniciales', () => {
  for (const value of [null, '', 'javascript:alert(1)', 'data:image/svg+xml,unsafe', '//external.test/a', '/\\external.test/a', 'https://user:pass@host/image']) assert.equal(safeImageUrl(value), null);
  assert.equal(safeImageUrl('/demo/photo.webp'), '/demo/photo.webp');
  assert.equal(safeImageUrl('https://example.test/photo.webp'), 'https://example.test/photo.webp');
  assert.equal(initials('  Negocio   Demo '), 'ND');
  assert.equal(initials(''), '');
});

