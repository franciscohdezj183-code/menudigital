import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.js';
import { createHealthHandler } from '../netlify/functions/health.js';
import { getDatabaseUrl } from '../netlify/lib/config.js';
import { logServerError } from '../netlify/lib/errors.js';
import { api, ApiError } from '../src/services/api.js';

const silent = () => {};
const adapter = (db) => ({ query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1) });

test('esquema PostgreSQL: migraciones repetibles, FK, índices, restricciones y triggers', async () => {
  const db = new PGlite();
  try {
    const client = adapter(db);
    assert.deepEqual(await migrate(client, undefined, silent), ['001_initial_schema.sql', '002_unique_user_email_case_insensitive.sql', '003_add_products_active.sql', '004_business_branding_and_media.sql', '005_promotion_carousel_cover.sql', '006_login_rate_limits.sql']);
    assert.deepEqual(await migrate(client, undefined, silent), []);
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map(r => r.tablename);
    for (const name of ['businesses', 'users', 'categories', 'products', 'product_variants', 'promotions', 'schema_migrations']) assert.ok(tables.includes(name));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'f'")).rows[0].n, 7);
    const indexes = (await db.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")).rows.map(r => r.indexname);
    for (const name of ['categories_menu_idx', 'products_category_idx', 'products_menu_idx', 'product_variants_product_idx', 'product_variants_business_idx', 'promotions_menu_idx']) assert.ok(indexes.includes(name));
    await db.exec("INSERT INTO businesses (name, slug) VALUES ('Test A', 'test-a'), ('Test B', 'test-b'); INSERT INTO categories (business_id, name) VALUES (1, 'Test'); INSERT INTO products (business_id, category_id, name, price) VALUES (1, 1, 'Test', 10.25);");
    assert.equal((await db.query('SELECT active FROM products WHERE id=1')).rows[0].active, true);
    const rejectsSql = (sql, code) => assert.rejects(db.exec(sql), error => error.code === code);
    await rejectsSql("INSERT INTO products (business_id, category_id, name, price) VALUES (2, 1, 'Test', 1)", '23503');
    await rejectsSql("INSERT INTO product_variants (business_id, product_id, name, price) VALUES (2, 1, 'Test', 1)", '23503');
    await rejectsSql("UPDATE products SET price = -1", '23514');
    await rejectsSql("UPDATE products SET price = 'NaN'", '23514');
    await rejectsSql("INSERT INTO product_variants (business_id, product_id, name, price) VALUES (1, 1, 'Test', -1)", '23514');
    await rejectsSql("INSERT INTO promotions (business_id, title, price) VALUES (1, 'Test', -1)", '23514');
    await rejectsSql("INSERT INTO promotions (business_id, title, starts_at, ends_at) VALUES (1, 'Test', '2026-02-02', '2026-02-01')", '23514');
    await rejectsSql("UPDATE categories SET sort_order = -1", '23514');
    await rejectsSql("INSERT INTO users (business_id, name, email, password_hash) VALUES (1, 'Test', 'UPPER@example.test', 'not-a-login-fixture')", '23514');
    await db.exec("INSERT INTO promotions (business_id, title) VALUES (1, 'Test'); INSERT INTO product_variants (business_id, product_id, name, price) VALUES (1, 1, 'Test', 0);");
    const before = (await db.query('SELECT updated_at FROM products WHERE id = 1')).rows[0].updated_at;
    await db.exec("UPDATE products SET name = 'Updated' WHERE id = 1");
    const after = (await db.query('SELECT updated_at FROM products WHERE id = 1')).rows[0].updated_at;
    assert.ok(new Date(after) > new Date(before));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal")).rows[0].n, 6);
    const health = await createHealthHandler(client.query, silent)({ httpMethod: 'GET' });
    assert.equal(health.statusCode, 200);
    assert.equal(JSON.parse(health.body).database, 'connected');
    await db.exec('DELETE FROM businesses WHERE id = 1');
    for (const table of ['categories', 'products', 'product_variants', 'promotions']) assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
  } finally { await db.close(); }
});

test('una migración fallida revierte DDL y registro; checksum protege archivos aplicados', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'menu-migrations-'));
  const directory = pathToFileURL(folder + '/');
  const db = new PGlite();
  try {
    const client = adapter(db);
    await writeFile(join(folder, '001_test.sql'), 'CREATE TABLE sample (id INT);');
    await migrate(client, directory, silent);
    await writeFile(join(folder, '002_fail.sql'), 'CREATE TABLE failed_sample (id INT); SELECT nonexistent_column;');
    await assert.rejects(migrate(client, directory, silent));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n, 1);
    assert.equal((await db.query("SELECT to_regclass('failed_sample') AS name")).rows[0].name, null);
    await writeFile(join(folder, '001_test.sql'), 'CREATE TABLE changed (id INT);');
    await assert.rejects(migrate(client, directory, silent), /modificada/);
  } finally { await db.close(); await rm(folder, { recursive: true, force: true }); }
});

test('health sanitiza errores, limita métodos y no habilita CORS', async () => {
  const secret = 'postgresql://private:secret@private/db';
  const handler = createHealthHandler(async () => { throw new Error(secret); }, silent);
  const result = await handler({ httpMethod: 'GET' });
  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), { ok: false, service: 'digital-menu-api', database: 'unavailable' });
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal((await handler({ httpMethod: 'POST' })).statusCode, 405);
});

test('configuración requerida y TLS, sin secretos en logs', t => {
  assert.throws(() => getDatabaseUrl({}), /obligatoria/);
  assert.throws(() => getDatabaseUrl({ DATABASE_URL: 'bad-secret' }), /no es válida/);
  assert.throws(() => getDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@host/db' }), /TLS/);
  const url = 'postgresql://u:p@host/db?sslmode=require';
  assert.equal(getDatabaseUrl({ DATABASE_URL: url }), url);
  const spy = t.mock.method(console, 'error', silent);
  logServerError('test', new Error(url));
  assert.ok(!spy.mock.calls[0].arguments[0].includes(url));
});

test('servicio fetch procesa JSON, HTTP, respuestas vacías y JSON inválido', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{"ok":true}', { status: 200 }));
  assert.deepEqual(await api('/health'), { ok: true });
  assert.equal(mock.mock.calls[0].arguments[0], '/api/health');
  mock.mock.mockImplementation(async () => new Response('secret', { status: 503 }));
  await assert.rejects(api('/health'), error => error instanceof ApiError && error.status === 503 && !error.message.includes('secret'));
  mock.mock.mockImplementation(async () => new Response(null, { status: 204 }));
  assert.equal(await api('/health'), null);
  mock.mock.mockImplementation(async () => new Response('<html/>'));
  await assert.rejects(api('/health'), /JSON inválida/);
  await assert.rejects(api('//outside.test'), TypeError);
});
