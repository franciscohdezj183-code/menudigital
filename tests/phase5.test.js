import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.js';
import { createOwner } from '../scripts/create-owner.js';
import { hashPassword, validOwnerPassword } from '../netlify/lib/passwords.js';
import { signSession, sessionCookie, authKey, SESSION_SECONDS } from '../netlify/lib/auth.js';
import { createLoginHandler } from '../netlify/functions/auth-login.js';
import { createMeHandler } from '../netlify/functions/auth-me.js';
import { createLogoutHandler } from '../netlify/functions/auth-logout.js';
import { createOverviewHandler } from '../netlify/functions/admin-overview.js';
const silent = () => {};
const env = { NODE_ENV: 'development', AUTH_SECRET: randomBytes(48).toString('hex') };
const password = randomBytes(20).toString('hex') + 'A9';
const post = body => ({ httpMethod: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:8890', origin: 'http://localhost:8890' }, body: JSON.stringify(body) });
const credentials = { email: 'owner@first.test', password };
const get = token => ({ httpMethod: 'GET', headers: token ? { cookie: `menu_session=${token}` } : {} });
const adapter = db => ({ query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1) });

test('auth: validación de entrada, métodos, secreto y logout idempotente', async t => {
  const login = createLoginHandler(() => assert.fail('No debe consultar'), env, silent);
  for (const [name, request] of [
    ['sin body', { ...post(), body: undefined }], ['JSON inválido', { ...post(), body: '{' }],
    ['null', post(null)], ['email inválido', post({ ...credentials, email: 'wrong' })],
    ['email ausente', post({ password })], ['password ausente', post({ email: credentials.email })],
    ['password vacío', post({ ...credentials, password: '' })], ['password no string', post({ ...credentials, password: 8 })],
    ['password excede bcrypt UTF8', post({ ...credentials, password: 'á'.repeat(37) })],
    ['body grande', { ...post(), body: 'x'.repeat(4097) }], ['tipo body', { ...post(credentials), body: {} }],
    ['tipo contenido', { ...post(credentials), headers: { 'content-type': 'text/plain' } }],
  ]) await t.test(name, async () => assert.equal((await login(request)).statusCode, name === 'body grande' ? 413 : 400));
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) await t.test(`login ${method}`, async () => assert.equal((await login({ httpMethod: method })).statusCode, 405));
  assert.equal((await login({ ...post(credentials), headers: { ...post().headers, origin: 'https://other.test' } })).statusCode, 403);
  for (const invalidEnv of [{}, { AUTH_SECRET: 'invalid' }]) {
    assert.throws(() => authKey(invalidEnv));
    const response = await createLoginHandler(() => assert.fail(), invalidEnv, silent)(post(credentials));
    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'SERVICE_UNAVAILABLE' });
  }
  const logout = createLogoutHandler(env);
  for (const cookie of [undefined, 'menu_session=invalid']) {
    const result = await logout({ ...post(), headers: { ...post().headers, cookie } });
    assert.equal(result.statusCode, 200); assert.ok(result.headers['Set-Cookie'].includes('Max-Age=0'));
    assert.ok(result.headers['Set-Cookie'].includes('HttpOnly'));
  }
  assert.equal((await logout({ httpMethod: 'GET' })).statusCode, 405);
  assert.ok(sessionCookie('test', { NODE_ENV: 'production' }).includes('; Secure'));
  assert.ok(sessionCookie('test', { NODE_ENV: 'development', CONTEXT: 'deploy-preview' }).includes('; Secure'));
  assert.ok(!sessionCookie('test', env).includes('; Secure'));
  assert.equal(validOwnerPassword('short'), false);
  assert.equal(validOwnerPassword('a'.repeat(10)), false);
  assert.equal(validOwnerPassword('1'.repeat(10)), false);
  assert.equal(validOwnerPassword('á'.repeat(37) + '1'), false);
});

test('auth y overview con PostgreSQL: aislamiento, revocación efectiva y campos seguros', async t => {
  const db = new PGlite();
  try {
    await migrate(adapter(db), undefined, silent);
    await db.exec(`
      INSERT INTO businesses(id,name,slug,active) OVERRIDING SYSTEM VALUE VALUES (1,'First','first',true),(2,'Second','second',true),(3,'Empty','empty',true);
      INSERT INTO categories(id,business_id,name) OVERRIDING SYSTEM VALUE VALUES (1,1,'First category'),(2,2,'Other category'),(3,2,'Another');
      INSERT INTO products(business_id,category_id,name,price,available,featured) VALUES (1,1,'A',1,true,true),(1,1,'B',2,false,false),(2,2,'Other',3,true,true);
    `);
    const hash = await hashPassword(password);
    await db.query("INSERT INTO users(id,business_id,name,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9007199254740999,1,'Owner First','owner@first.test',$1,'OWNER'),(2,2,'Owner Second','owner@second.test',$1,'OWNER'),(3,3,'Empty Owner','owner@empty.test',$1,'OWNER')", [hash]);
    const queries = [];
    const runQuery = async (sql, params) => { queries.push({ sql, params }); return (await db.query(sql, params)).rows; };
    const login = createLoginHandler(runQuery, env, silent);
    const me = createMeHandler(runQuery, env, silent);
    const overview = createOverviewHandler(runQuery, env, silent);
    let token;
    await t.test('login OWNER, email normalizado, JWT y cookie seguros', async () => {
      const result = await login(post({ ...credentials, email: ' OWNER@FIRST.TEST ' }));
      assert.equal(result.statusCode, 200);
      const cookie = result.headers['Set-Cookie'];
      for (const part of ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${SESSION_SECONDS}`]) assert.ok(cookie.includes(part));
      token = cookie.split(';')[0].split('=')[1];
      const payload = decodeJwt(token);
      assert.equal(payload.sub, '9007199254740999');
      assert.equal(payload.exp - payload.iat, SESSION_SECONDS);
      const data = JSON.parse(result.body);
      assert.deepEqual(Object.keys(data.user).sort(), ['email', 'id', 'name', 'role']);
      assert.deepEqual(Object.keys(data.business).sort(), ['logo_url', 'name', 'slug', 'theme_color']);
      assert.ok(!result.body.includes(token) && !result.body.includes(hash) && !result.body.includes(env.AUTH_SECRET));
      assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
    });
    for (const [name, body] of [['usuario inexistente', { ...credentials, email: 'absent@test.test' }], ['password incorrecta', { ...credentials, password: randomBytes(20).toString('hex') }]]) await t.test(name, async () => {
      const result = await login(post(body)); assert.equal(result.statusCode, 401);
      assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'INVALID_CREDENTIALS' });
    });
    for (const [name, change, restore, expected] of [
      ['usuario inactivo', 'UPDATE users SET active=false WHERE business_id=1', 'UPDATE users SET active=true WHERE business_id=1', 401],
      ['negocio inactivo', 'UPDATE businesses SET active=false WHERE id=1', 'UPDATE businesses SET active=true WHERE id=1', 401],
      ['rol sin acceso', "UPDATE users SET role='STAFF' WHERE business_id=1", "UPDATE users SET role='OWNER' WHERE business_id=1", 403],
    ]) await t.test(name, async () => {
      await db.exec(change);
      assert.equal((await login(post(credentials))).statusCode, expected);
      assert.equal((await me(get(token))).statusCode, expected);
      assert.equal((await overview(get(token))).statusCode, expected);
      await db.exec(restore);
    });
    const expired = await new SignJWT({ business_id: '1', role: 'OWNER' }).setSubject('9007199254740999').setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('digital-menu').setAudience('owner-panel').setIssuedAt(1).setExpirationTime(2).sign(authKey(env));
    for (const [name, value] of [
      ['sin cookie', undefined], ['token inválido', 'invalid'], ['token alterado', token.slice(0, -4) + 'xxxx'], ['expirado', expired],
      ['usuario inexistente', await signSession({ id: '99', business_id: '1', role: 'OWNER' }, env)],
      ['empresa no coincide', await signSession({ id: '9007199254740999', business_id: '2', role: 'OWNER' }, env)],
    ]) await t.test(name, async () => {
      assert.equal((await me(get(value))).statusCode, 401);
      assert.equal((await overview(get(value))).statusCode, 401);
    });
    await t.test('me válido y BIGINT exacto', async () => {
      const result = await me(get(token)); assert.equal(result.statusCode, 200);
      const data = JSON.parse(result.body); assert.equal(data.user.id, '9007199254740999');
      assert.equal(data.business.slug, 'first'); assert.ok(!result.body.includes('password_hash'));
    });
    await t.test('conteos de A ignoran business_id enviado por cliente', async () => {
      const result = await overview({ ...get(token), queryStringParameters: { business_id: '2' } });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(JSON.parse(result.body).summary, { categories: 1, products: 2, available_products: 1, unavailable_products: 1, featured_products: 1 });
      assert.deepEqual(queries.at(-1).params, ['1']);
      assert.equal(JSON.parse(result.body).business.slug, 'first');
    });
    await t.test('B obtiene sus propios conteos y negocio vacío admite ceros', async () => {
      const other = await signSession({ id: '2', business_id: '2', role: 'OWNER' }, env);
      assert.equal(JSON.parse((await overview(get(other))).body).summary.products, 1);
      const empty = await signSession({ id: '3', business_id: '3', role: 'OWNER' }, env);
      assert.ok(Object.values(JSON.parse((await overview(get(empty))).body).summary).every(n => n === 0));
    });
    await t.test('cambio de negocio en DB invalida sesión anterior', async () => {
      await db.exec('UPDATE users SET business_id=2 WHERE id=9007199254740999');
      assert.equal((await me(get(token))).statusCode, 401);
      await db.exec('UPDATE users SET business_id=1 WHERE id=9007199254740999');
    });
    await t.test('correo único global y creación OWNER no sobrescribe', async () => {
      await assert.rejects(db.query("INSERT INTO users(business_id,name,email,password_hash) VALUES (2,'Duplicate','owner@first.test',$1)", [hash]), error => error.code === '23505');
      await db.exec("SELECT setval(pg_get_serial_sequence('users', 'id'), 100)");
      const ownerEnv = { OWNER_NAME: 'New Owner', OWNER_EMAIL: 'NEW@FIRST.TEST ', OWNER_PASSWORD: password, OWNER_BUSINESS_SLUG: 'first' };
      assert.equal(await createOwner(adapter(db), ownerEnv), true);
      assert.equal(await createOwner(adapter(db), { ...ownerEnv, OWNER_NAME: 'Changed' }), false);
      const row = (await db.query("SELECT name,password_hash FROM users WHERE email='new@first.test'")).rows[0];
      assert.equal(row.name, 'New Owner'); assert.ok(row.password_hash.startsWith('$2b$12$')); assert.ok(row.password_hash !== password);
    });
    for (const handler of [me, overview]) assert.equal((await handler({ httpMethod: 'POST' })).statusCode, 405);
    assert.equal((await me({ ...get(), headers: { cookie: `menu_session=${token}; menu_session=${token}` } })).statusCode, 401);
    for (const factory of [createMeHandler, createOverviewHandler]) {
      const result = await factory(async () => { throw new Error('private database details'); }, env, silent)(get(token));
      assert.equal(result.statusCode, 503); assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'SERVICE_UNAVAILABLE' });
    }
  } finally { await db.close(); }
});
