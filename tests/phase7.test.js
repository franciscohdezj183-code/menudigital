import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.js';
import { signSession } from '../netlify/lib/auth.js';
import { createAdminBusinessHandler } from '../netlify/functions/admin-business.js';
import { createAdminPromotionsHandler } from '../netlify/functions/admin-promotions.js';
import { createPublicMenuHandler } from '../netlify/functions/public-menu.js';
import { createMediaSignHandler } from '../netlify/functions/admin-media-sign.js';
import { createMediaCompleteHandler } from '../netlify/functions/admin-media-complete.js';
import { createMediaRemoveHandler } from '../netlify/functions/admin-media-remove.js';
import { optimizedImageUrl } from '../src/utils/images.js';
import { themeColor } from '../src/utils/theme.js';

const silent=()=>{};
const env={NODE_ENV:'development',AUTH_SECRET:randomBytes(48).toString('hex'),CLOUDINARY_CLOUD_NAME:'demo',CLOUDINARY_API_KEY:'key',CLOUDINARY_API_SECRET:'secret'};
const adapter=db=>({query:async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1)});
const json=response=>JSON.parse(response.body);
const event=(method,data,token,queryStringParameters={})=>({httpMethod:method,headers:{'content-type':'application/json',origin:'http://localhost',host:'localhost',...(token?{cookie:`menu_session=${token}`}:{})},body:JSON.stringify(data),queryStringParameters});
async function setup(){
 const db=new PGlite();await migrate(adapter(db),undefined,silent);
 await db.exec("INSERT INTO businesses(id,name,slug) OVERRIDING SYSTEM VALUE VALUES(1,'A','a'),(2,'B','b'); INSERT INTO users(id,business_id,name,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES(1,1,'Owner','a@test.local','hash','OWNER')");
 return {db,run:async(s,p)=>(await db.query(s,p)).rows,token:await signSession({id:'1',business_id:'1',role:'OWNER'},env)};
}

test('FASE 7: negocio, promociones y publicación programada',async()=>{
 const {db,run,token}=await setup();try{
  await db.exec("INSERT INTO promotions(id,business_id,title,image_url,active,sort_order,starts_at,ends_at) OVERRIDING SYSTEM VALUE VALUES(11,1,'Actual','https://res.cloudinary.com/demo/image/upload/actual.webp',true,2,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 hour'),(12,1,'Futura',NULL,true,1,NOW()+INTERVAL '1 day',NULL),(13,1,'Terminada',NULL,true,3,NULL,NOW()-INTERVAL '1 hour'),(14,2,'Ajena',NULL,true,1,NULL,NULL),(15,1,'Inactiva',NULL,false,4,NULL,NULL)");
  const business=createAdminBusinessHandler(run,env,silent);
  assert.equal((await business(event('PATCH',{slug:'hack'},token))).statusCode,400);
  const changed=json(await business(event('PATCH',{name:' A nueva ',description:'Texto',address:'',phone:null,theme_color:'#f445c8'},token))).business;
  assert.deepEqual([changed.name,changed.slug,changed.theme_color],['A nueva','a','#F445C8']);
  const promotions=createAdminPromotionsHandler(run,env,silent);
  const listed=json(await promotions(event('GET',{},token))).promotions;
  assert.deepEqual(listed.map(item=>item.title),['Futura','Actual','Terminada','Inactiva']);
  assert.equal((await promotions(event('POST',{title:'Mal',starts_at:'2026-01-03T00:00:00Z',ends_at:'2026-01-02T00:00:00Z'},token))).statusCode,400);
  const created=json(await promotions(event('POST',{title:'Nueva',price:'99.5'},token))).promotion;
  assert.equal(created.price,'99.50');
  const withoutPrice=json(await promotions(event('POST',{title:'Sin precio',price:null},token))).promotion;
  assert.equal(withoutPrice.price,null);
  assert.equal((await promotions(event('PATCH',{title:'Hack'},token,{promotion_id:'14'}))).statusCode,404);
  assert.equal((await promotions(event('PATCH',{business_id:'2'},token,{promotion_id:created.id}))).statusCode,400);
  const edited=json(await promotions(event('PATCH',{description:'Editada',active:false},token,{promotion_id:created.id}))).promotion;
  assert.equal(edited.active,false);assert.equal(edited.description,'Editada');
  await promotions(event('PATCH',{active:true},token,{promotion_id:created.id}));
  const publicData=json(await createPublicMenuHandler(run,silent)({httpMethod:'GET',queryStringParameters:{slug:'a'}}));
  assert.deepEqual(publicData.promotions.map(x=>x.title),['Actual','Nueva','Sin precio']);
  assert.deepEqual(Object.keys(publicData.promotions[0]).sort(),['description','id','image_url','price','title']);
  assert.equal(publicData.promotions[0].image_url,'https://res.cloudinary.com/demo/image/upload/actual.webp');
  assert.equal(publicData.business.theme_color,'#F445C8');assert.ok(!JSON.stringify(publicData).includes('image_public_id'));
  assert.equal(publicData.business.promotion_cover_url,null);
 }finally{await db.close()}
});

test('FASE 7: medios firmados respetan propiedad y no aceptan borrado arbitrario',async()=>{
 const {db,run,token}=await setup();try{
  await db.exec("INSERT INTO categories(id,business_id,name) OVERRIDING SYSTEM VALUE VALUES(1,1,'Cat'),(9,2,'Ajena'); INSERT INTO products(id,business_id,category_id,name,price) OVERRIDING SYSTEM VALUE VALUES(1,1,1,'P',1); INSERT INTO promotions(id,business_id,title) OVERRIDING SYSTEM VALUE VALUES(5,1,'Promo'),(9,2,'Ajena')");
  const destroyed=[];const mock={utils:{api_sign_request:()=> 'signed'},api:{resource:async public_id=>({public_id,resource_type:'image',type:'upload',format:'webp',bytes:1200,width:1200,height:800,secure_url:`https://res.cloudinary.com/demo/image/upload/${public_id}.webp`})},uploader:{destroy:async id=>destroyed.push(id)}};
  const authorized=public_id=>({public_id,upload_timestamp:Math.floor(Date.now()/1000),upload_signature:'signed'});
  const sign=createMediaSignHandler(run,env,silent,()=>mock);const signed=json(await sign(event('POST',{target:'product',entity_id:'1'},token))).upload;
  assert.equal(signed.folder,'digital-menu/1/products');assert.ok(!JSON.stringify(signed).includes('secret'));assert.equal((await sign(event('POST',{target:'category',entity_id:'9'},token))).statusCode,404);
  const complete=createMediaCompleteHandler(run,env,silent,()=>mock);const publicId='digital-menu/1/products/11111111-1111-4111-8111-111111111111';
  assert.equal((await complete(event('POST',{target:'product',entity_id:'1',public_id:'digital-menu/2/products/hack'},token))).statusCode,400);
  assert.equal((await complete(event('POST',{target:'product',entity_id:'1',...authorized(publicId)},token))).statusCode,200);
  const remove=createMediaRemoveHandler(run,env,silent,()=>mock);assert.equal((await remove(event('POST',{target:'product',entity_id:'1',public_id:publicId},token))).statusCode,400);assert.equal((await remove(event('POST',{target:'product',entity_id:'1'},token))).statusCode,200);assert.deepEqual(destroyed,[publicId]);
  assert.equal((await sign(event('POST',{target:'promotion',entity_id:'9'},token))).statusCode,404);
  const promotionUpload=json(await sign(event('POST',{target:'promotion',entity_id:'5'},token))).upload;
  assert.equal(promotionUpload.folder,'digital-menu/1/promotions');
  const promoImage1='digital-menu/1/promotions/22222222-2222-4222-8222-222222222222';
  const promoImage2='digital-menu/1/promotions/33333333-3333-4333-8333-333333333333';
  assert.equal((await complete(event('POST',{target:'promotion',entity_id:'5',...authorized(promoImage1)},token))).statusCode,200);
  assert.equal((await complete(event('POST',{target:'promotion',entity_id:'5',...authorized(promoImage2)},token))).statusCode,200);
  assert.ok(destroyed.includes(promoImage1));
  assert.equal((await remove(event('POST',{target:'promotion',entity_id:'5'},token))).statusCode,200);
  assert.ok(destroyed.includes(promoImage2));
  const stored=(await db.query('SELECT image_url,image_public_id FROM promotions WHERE id=5')).rows[0];
  assert.deepEqual(stored,{image_url:null,image_public_id:null});
  const coverUpload=json(await sign(event('POST',{target:'promotion_cover'},token))).upload;
  assert.equal(coverUpload.folder,'digital-menu/1/promotion-covers');
  const coverPublicId='digital-menu/1/promotion-covers/44444444-4444-4444-8444-444444444444';
  assert.equal((await complete(event('POST',{target:'promotion_cover',...authorized(coverPublicId)},token))).statusCode,200);
  assert.equal((await db.query('SELECT promotion_cover_url FROM businesses WHERE id=1')).rows[0].promotion_cover_url,`https://res.cloudinary.com/demo/image/upload/${coverPublicId}.webp`);
  assert.equal((await remove(event('POST',{target:'promotion_cover'},token))).statusCode,200);
  assert.ok(destroyed.includes(coverPublicId));
 }finally{await db.close()}
});

test('FASE 7: tema seguro y optimización exclusiva de Cloudinary',()=>{
 assert.equal(themeColor('bad'),'#9250D8');assert.equal(themeColor('#4da9ce'),'#4DA9CE');assert.match(optimizedImageUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg',{width:600}),/upload\/f_auto,q_auto,w_600\/v1/);assert.equal(optimizedImageUrl('https://example.com/a.jpg',{width:600}),'https://example.com/a.jpg');
});
