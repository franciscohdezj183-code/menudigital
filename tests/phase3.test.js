import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.js';
import { seedDevelopment } from '../scripts/seed-dev.js';
import { createPublicCategoryHandler } from '../netlify/functions/public-category.js';
import { getPublicCategory, ApiError } from '../src/services/api.js';
import { formatPrice, normalizeSearch, filterProducts } from '../src/utils/products.js';

const silent = () => {};
const event = (slug = 'first', category_id = '9007199254740997', httpMethod = 'GET') => ({httpMethod, queryStringParameters:{slug, category_id}});
const adapter = db => ({query: async (sql, params) => params ? db.query(sql,params) : (await db.exec(sql)).at(-1)});

test('public-category: parámetros obligatorios, BIGINT positivo y método', async t => {
  const handler = createPublicCategoryHandler(() => assert.fail('No debe consultar la base'), silent);
  const requests = [
    ['slug ausente', {httpMethod:'GET',queryStringParameters:{category_id:'1'}}],
    ['category_id ausente', {httpMethod:'GET',queryStringParameters:{slug:'first'}}],
    ...['', '0', '-1', 'abc', '1.5', '1 OR 1=1', '9223372036854775808', '9'.repeat(100), '1e3', '+1', ' 1', '01'].map(id => [`id inválido: ${id.slice(0,22)}`,event('first',id)]),
    ['slug inválido',event("a' OR true")],
    ['id repetido',{...event(),multiValueQueryStringParameters:{category_id:['1','2']}}],
    ['slug repetido',{...event(),multiValueQueryStringParameters:{slug:['first','second']}}],
  ];
  for (const [name, request] of requests) await t.test(name, async () => {
    const result = await handler(request);
    assert.equal(result.statusCode,400);
    assert.deepEqual(JSON.parse(result.body),{ok:false,error:'INVALID_REQUEST'});
  });
  const result=await handler(event('first','1','POST'));
  assert.equal(result.statusCode,405);
  assert.equal(result.headers.Allow,'GET');
});

test('public-category con PostgreSQL: pertenencia, estados, orden y precisión', async t => {
  const db=new PGlite();
  try {
    await migrate(adapter(db),undefined,silent);
    await db.exec(`
      INSERT INTO businesses (id,name,slug,active) OVERRIDING SYSTEM VALUE VALUES (1,'First','first',true),(2,'Second','second',true),(3,'Hidden','hidden',false);
      INSERT INTO categories (id,business_id,name,active) OVERRIDING SYSTEM VALUE VALUES
        (9007199254740997,1,'Preparadas',true),(11,2,'Other business',true),(12,1,'Inactive',false),(13,1,'Empty',true),(14,1,'Other category',true),(15,3,'Hidden business',true);
      INSERT INTO products (id,business_id,category_id,name,description,price,available,featured,sort_order) OVERRIDING SYSTEM VALUE VALUES
        (9007199254740999,1,9007199254740997,'Featured later','Limón',75.50,true,true,3),
        (9007199254740998,1,9007199254740997,'Featured first',NULL,9999999999.99,true,true,1),
        (9,1,9007199254740997,'Normal first','Description',65,true,false,0),
        (10,1,9007199254740997,'Normal sold out',NULL,80,false,false,0),
        (103,2,11,'Other business product',NULL,1,true,true,0),
        (104,1,14,'Other category product',NULL,1,true,true,0);
    `);
    const calls=[];
    const handler=createPublicCategoryHandler(async (sql,params)=>{ calls.push({sql,params});return (await db.query(sql,params)).rows; },silent);
    const cases=[
      ['negocio inexistente','missing','1','BUSINESS_NOT_FOUND'],
      ['negocio inactivo','hidden','15','BUSINESS_NOT_FOUND'],
      ['categoría inexistente','first','999','CATEGORY_NOT_FOUND'],
      ['categoría inactiva','first','12','CATEGORY_NOT_FOUND'],
      ['categoría de otra empresa','first','11','CATEGORY_NOT_FOUND'],
    ];
    for(const [name,slug,id,code] of cases) await t.test(name,async()=>{
      const result=await handler(event(slug,id));
      assert.equal(result.statusCode,404);
      assert.deepEqual(JSON.parse(result.body),{ok:false,error:code});
    });
    await t.test('éxito conserva BIGINT, NUMERIC, campos públicos y orden estable',async()=>{
      const result=await handler(event(' FIRST '));
      assert.equal(result.statusCode,200);
      const data=JSON.parse(result.body);
      assert.equal(data.category.id,'9007199254740997');
      assert.deepEqual(data.products.map(p=>p.id),['9007199254740998','9007199254740999','9','10']);
      assert.equal(data.products[0].price,'9999999999.99');
      assert.equal(data.products[1].price,'75.50');
      assert.equal(data.products.at(-1).available,false);
      assert.equal(data.products[0].description,null);
      assert.deepEqual(Object.keys(data.business).sort(),['logo_url','name','slug','theme_color']);
      assert.deepEqual(Object.keys(data.category).sort(),['id','image_url','name']);
      assert.deepEqual(Object.keys(data.products[0]).sort(),['available','description','featured','id','image_url','name','price','sort_order']);
      assert.deepEqual(calls.at(-3).params,['first']);
      assert.deepEqual(calls.at(-2).params,['9007199254740997','1']);
      assert.deepEqual(calls.at(-1).params,['1','9007199254740997']);
      assert.ok(!calls.at(-1).sql.includes('9007199254740997'));
      assert.equal(result.headers['Access-Control-Allow-Origin'],undefined);
    });
    await t.test('categoría vacía responde 200 con array vacío',async()=>{
      const result=await handler(event('first','13'));
      assert.equal(result.statusCode,200);
      assert.deepEqual(JSON.parse(result.body).products,[]);
    });
  }finally{await db.close();}
});

test('public-category: fallos de las tres consultas no exponen información interna',async()=>{
  for(const failureAt of [1,2,3]){
    let call=0;
    const handler=createPublicCategoryHandler(async()=>{
      if(++call===failureAt) throw new Error('DATABASE_URL postgresql://private:secret@host/db SELECT stack');
      return [{id:'1',name:'Test',slug:'first'}];
    },silent);
    const result=await handler(event());
    assert.equal(result.statusCode,503);
    assert.deepEqual(JSON.parse(result.body),{ok:false,error:'SERVICE_UNAVAILABLE'});
  }
});

test('formato exacto de precios y búsqueda local normalizada',()=>{
  for(const [value,expected] of [['75.00','$75'],['75.50','$75.50'],['0.00','$0'],['1.05','$1.05'],['9999999999.99','$9,999,999,999.99']]) assert.equal(formatPrice(value),expected);
  assert.equal(formatPrice(null),'Precio no disponible');
  assert.equal(normalizeSearch('  LIMÓN    Clásico '),'limon clasico');
  const products=[{name:'Michelada Clásica',description:'Limón de la casa'},{name:'Cubana',description:null}];
  assert.equal(filterProducts(products,'  ').length,2);
  assert.deepEqual(filterProducts(products,' LIMON  casa '),[products[0]]);
  assert.deepEqual(filterProducts(products,'MICHELADA'),[products[0]]);
  assert.deepEqual(filterProducts(products,'no coincide'),[]);
});

test('getPublicCategory codifica parámetros, señal y códigos de error seguros',async t=>{
  const controller=new AbortController();
  const mock=t.mock.method(globalThis,'fetch',async()=>new Response('{}'));
  await getPublicCategory('a&b','9007199254740997',{signal:controller.signal});
  assert.equal(mock.mock.calls[0].arguments[0],'/api/public-category?slug=a%26b&category_id=9007199254740997');
  assert.equal(mock.mock.calls[0].arguments[1].signal,controller.signal);
  mock.mock.mockImplementation(async()=>new Response('{"error":"CATEGORY_NOT_FOUND"}',{status:404}));
  await assert.rejects(getPublicCategory('a','1'),e=>e instanceof ApiError&&e.code==='CATEGORY_NOT_FOUND');
  mock.mock.mockImplementation(async()=>new Response('{"error":"secret SQL detail"}',{status:503}));
  await assert.rejects(getPublicCategory('a','1'),e=>e.code===null&&!e.message.includes('secret'));
});

test('seed: completa FASE 2 sin sobrescribir y revierte fallos parciales',async()=>{
  const db=new PGlite();
  try{
    const client=adapter(db);
    await migrate(client,undefined,silent);
    await db.exec("INSERT INTO businesses(name,slug,description) VALUES ('Negocio Demo','negocio-demo','Custom description'); INSERT INTO categories(business_id,name) VALUES (1,'Preparadas');");
    const failingClient={query:async(sql,params)=>{if(sql.includes('INSERT INTO products'))throw new Error('test failure');return client.query(sql,params);}};
    await assert.rejects(seedDevelopment(failingClient,{NODE_ENV:'development'}));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM categories')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM products')).rows[0].n,0);
    assert.equal(await seedDevelopment(client,{NODE_ENV:'development'}),true);
    await db.exec("UPDATE products SET price=99.99 WHERE name='Cubana'");
    assert.equal(await seedDevelopment(client,{NODE_ENV:'development'}),false);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM products')).rows[0].n,14);
    assert.equal((await db.query("SELECT price::text AS price FROM products WHERE name='Cubana'")).rows[0].price,'99.99');
    assert.equal((await db.query('SELECT description FROM businesses')).rows[0].description,'Custom description');
  }finally{await db.close();}
});

