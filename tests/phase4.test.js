import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.js';
import { seedDevelopment } from '../scripts/seed-dev.js';
import { createPublicProductHandler } from '../netlify/functions/public-product.js';
import { getPublicProduct } from '../src/services/api.js';
const silent = () => {};
const adapter = db => ({ query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1) });
const event = (params = {}, httpMethod = 'GET') => ({ httpMethod, queryStringParameters: { slug: 'first', category_id: '9007199254740997', product_id: '9007199254740999', ...params } });

test('public-product: valida todos los parámetros antes de consultar', async t => {
  const handler = createPublicProductHandler(() => assert.fail('Consulta inesperada'), silent);
  for (const name of ['slug', 'category_id', 'product_id']) {
    await t.test(`${name} obligatorio`, async () => assert.equal((await handler(event({ [name]: undefined }))).statusCode, 400));
    await t.test(`${name} repetido`, async () => assert.equal((await handler({ ...event(), multiValueQueryStringParameters: { [name]: ['1', '2'] } })).statusCode, 400));
  }
  for (const name of ['category_id', 'product_id']) for (const id of ['', '0', '-1', '1.5', 'abc', '1 OR 1=1', '9223372036854775808', '01', ' 1', '+1', '1e3']) {
    await t.test(`${name} inválido ${id}`, async () => assert.equal((await handler(event({ [name]: id }))).statusCode, 400));
  }
  assert.equal((await handler(event({ slug: "x' OR true" }))).statusCode, 400);
  const post = await handler(event({}, 'POST'));
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.Allow, 'GET');
});

test('public-product: PostgreSQL verifica cadena de pertenencia, variantes y precisión', async t => {
  const db = new PGlite();
  try {
    await migrate(adapter(db), undefined, silent);
    await db.exec(`
      INSERT INTO businesses(id,name,slug,active) OVERRIDING SYSTEM VALUE VALUES (1,'First','first',true),(2,'Second','second',true),(3,'Hidden','hidden',false);
      INSERT INTO categories(id,business_id,name,active) OVERRIDING SYSTEM VALUE VALUES
      (9007199254740997,1,'Preparadas',true),(11,2,'Other business',true),(12,1,'Inactive',false),(13,1,'Other category',true),(14,3,'Hidden category',true);
      INSERT INTO products(id,business_id,category_id,name,description,price,available,featured) OVERRIDING SYSTEM VALUE VALUES
      (9007199254740999,1,9007199254740997,'Principal','Descripción completa',9999999999.99,true,true),
      (10,1,9007199254740997,'Agotado',NULL,75.50,false,false),
      (20,2,11,'Ajeno',NULL,1,true,false),(21,1,13,'Otra categoría',NULL,1,true,false);
      INSERT INTO product_variants(id,business_id,product_id,name,price,sort_order,active) OVERRIDING SYSTEM VALUE VALUES
      (9,1,9007199254740999,'Primera',65,1,true),(10,1,9007199254740999,'Segunda',75.50,1,true),
      (9007199254740998,1,9007199254740999,'Grande',9999999999.99,2,true),
      (11,1,9007199254740999,'Oculta',1,0,false),(12,1,10,'Otro producto',80,0,true),(13,2,20,'Otra empresa',1,0,true);
    `);
    const calls = [];
    const handler = createPublicProductHandler(async (sql, params) => { calls.push({ sql, params }); return (await db.query(sql, params)).rows; }, silent);
    for (const [name, params, code, count] of [
      ['negocio inexistente', { slug: 'missing' }, 'BUSINESS_NOT_FOUND', 1],
      ['negocio inactivo', { slug: 'hidden', category_id: '14' }, 'BUSINESS_NOT_FOUND', 1],
      ['categoría inexistente', { category_id: '999' }, 'CATEGORY_NOT_FOUND', 2],
      ['categoría inactiva', { category_id: '12' }, 'CATEGORY_NOT_FOUND', 2],
      ['categoría ajena', { category_id: '11' }, 'CATEGORY_NOT_FOUND', 2],
      ['producto inexistente', { product_id: '999' }, 'PRODUCT_NOT_FOUND', 3],
      ['producto de otra empresa', { product_id: '20' }, 'PRODUCT_NOT_FOUND', 3],
      ['producto de otra categoría', { product_id: '21' }, 'PRODUCT_NOT_FOUND', 3],
    ]) await t.test(name, async () => {
      calls.length = 0;
      const result = await handler(event(params));
      assert.equal(result.statusCode, 404);
      assert.deepEqual(JSON.parse(result.body), { ok: false, error: code });
      assert.equal(calls.length, count, 'No consulta variantes antes de validar el producto');
    });
    await t.test('válido: campos públicos, variantes activas propias, orden numérico y decimales', async () => {
      calls.length = 0;
      const result = await handler(event({ slug: ' FIRST ' }));
      assert.equal(result.statusCode, 200);
      const data = JSON.parse(result.body);
      assert.deepEqual(Object.keys(data.business).sort(), ['logo_url', 'name', 'slug', 'theme_color']);
      assert.deepEqual(Object.keys(data.category).sort(), ['id', 'name']);
      assert.deepEqual(Object.keys(data.product).sort(), ['available', 'description', 'featured', 'id', 'image_url', 'name', 'price']);
      for (const variant of data.variants) assert.deepEqual(Object.keys(variant).sort(), ['id', 'name', 'price', 'sort_order']);
      assert.equal(data.category.id, '9007199254740997');
      assert.equal(data.product.id, '9007199254740999');
      assert.equal(data.product.price, '9999999999.99');
      assert.deepEqual(data.variants.map(v => v.id), ['9', '10', '9007199254740998']);
      assert.deepEqual(data.variants.map(v => v.price), ['65.00', '75.50', '9999999999.99']);
      assert.deepEqual(calls.map(c => c.params), [['first'], ['9007199254740997', '1'], ['9007199254740999', '1', '9007199254740997'], ['1', '9007199254740999']]);
      assert.ok(calls.every(c => !c.sql.includes('9007199254740999')));
      assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
    });
    await t.test('agotado conserva detalle y variantes; sin variantes devuelve array vacío', async () => {
      const result = await handler(event({ product_id: '10' }));
      assert.equal(result.statusCode, 200);
      const data = JSON.parse(result.body);
      assert.equal(data.product.available, false);
      assert.equal(data.product.description, null);
      assert.equal(data.variants[0].name, 'Otro producto');
      assert.deepEqual(JSON.parse((await handler(event({ product_id: '21', category_id: '13' }))).body).variants, []);
    });
  } finally { await db.close(); }
});

test('public-product: sanitiza errores en las cuatro consultas', async () => {
  for (const failureAt of [1, 2, 3, 4]) {
    let calls = 0;
    const handler = createPublicProductHandler(async () => {
      if (++calls === failureAt) throw new Error('DATABASE_URL postgresql://secret@host SQL stack');
      return [{ id: '1', name: 'Test' }];
    }, silent);
    const result = await handler(event());
    assert.equal(result.statusCode, 503);
    assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'SERVICE_UNAVAILABLE' });
  }
});

test('getPublicProduct: codifica parámetros, transmite señal y conserva código público', async t => {
  const controller = new AbortController();
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await getPublicProduct('a&b', '9007199254740997', '9007199254740999', { signal: controller.signal });
  assert.equal(mock.mock.calls[0].arguments[0], '/api/public-product?slug=a%26b&category_id=9007199254740997&product_id=9007199254740999');
  assert.equal(mock.mock.calls[0].arguments[1].signal, controller.signal);
  mock.mock.mockImplementation(async () => new Response('{"error":"PRODUCT_NOT_FOUND"}', { status: 404 }));
  await assert.rejects(getPublicProduct('first', '1', '1'), e => e.status === 404 && e.code === 'PRODUCT_NOT_FOUND');
});

test('seed variantes: transacción, idempotencia y conservación de ediciones', async () => {
  const db = new PGlite();
  try {
    const client = adapter(db);
    await migrate(client, undefined, silent);
    await assert.rejects(seedDevelopment({ query: async (sql, params) => {
      if (sql.includes('INSERT INTO product_variants')) throw new Error('fallo simulado');
      return client.query(sql, params);
    } }, { NODE_ENV: 'development' }));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM businesses')).rows[0].n, 0);
    assert.equal(await seedDevelopment(client, { NODE_ENV: 'development' }), true);
    await db.exec("UPDATE product_variants SET price=88.88 WHERE name='Botella'; UPDATE products SET description='Edición manual' WHERE name='Modelo Especial'");
    assert.equal(await seedDevelopment(client, { NODE_ENV: 'development' }), false);
    const variants = (await db.query('SELECT v.*, p.name AS product_name FROM product_variants v JOIN products p ON p.id=v.product_id')).rows;
    assert.equal(variants.length, 11);
    assert.equal(variants.filter(v => !v.active).length, 1);
    assert.equal(variants.find(v => v.name === 'Botella').price, '88.88');
    assert.equal(variants.filter(v => v.product_name === 'Alitas').length, 3);
    assert.equal(variants.filter(v => v.product_name === 'Azulito').length, 2);
    assert.equal(variants.filter(v => v.product_name === 'Modelo Especial').length, 2);
    assert.equal(variants.filter(v => v.product_name === 'Cubana').length, 0);
    assert.equal((await db.query("SELECT description FROM products WHERE name='Modelo Especial'")).rows[0].description, 'Edición manual');
  } finally { await db.close(); }
});
