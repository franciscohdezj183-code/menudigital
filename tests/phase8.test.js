import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import QRCode from 'qrcode';
import { migrate } from '../scripts/migrate.js';
import { signSession } from '../netlify/lib/auth.js';
import { createAdminQrHandler } from '../netlify/functions/admin-qr.js';
import { getPublicSiteUrl, isLocalSiteUrl, publicMenuUrl, PublicSiteUrlError } from '../netlify/lib/config.js';
import { createQrPng, createQrSvg, QR_OPTIONS } from '../src/utils/qr.js';

const silent=()=>{};
const secret=randomBytes(48).toString('hex');
const adapter=db=>({query:async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1)});
const request=(token,method='GET',queryStringParameters={})=>({httpMethod:method,headers:token?{cookie:`menu_session=${token}`}:{},queryStringParameters});
const body=response=>JSON.parse(response.body);

test('FASE 8: URL pública se valida, normaliza y clasifica sin usar el navegador',()=>{
  assert.equal(getPublicSiteUrl({PUBLIC_SITE_URL:' https://menu.example.com/// '}),'https://menu.example.com');
  assert.equal(publicMenuUrl('https://menu.example.com','cantina-don-pedro'),'https://menu.example.com/cantina-don-pedro');
  for(const value of [undefined,'ftp://example.com','not-a-url','https://user:pass@example.com','https://example.com?q=1','https://example.com/#x']) {
    assert.throws(()=>getPublicSiteUrl({PUBLIC_SITE_URL:value}),PublicSiteUrlError);
  }
  for(const value of ['http://localhost:8888','http://127.0.0.1','http://192.168.1.91:8892','http://10.4.2.1','http://172.16.0.1','http://172.31.255.1','http://[::1]:8888']) assert.equal(isLocalSiteUrl(value),true,value);
  for(const value of ['https://menu.example.com','https://site.netlify.app','http://172.32.0.1','http://192.169.1.1']) assert.equal(isLocalSiteUrl(value),false,value);
});

test('FASE 8: endpoint QR exige OWNER y deriva empresa y slug de la sesión',async()=>{
  const db=new PGlite();
  try{
    await migrate(adapter(db),undefined,silent);
    await db.exec("INSERT INTO businesses(id,name,slug,logo_url,theme_color) OVERRIDING SYSTEM VALUE VALUES(1,'Negocio A','negocio-a','https://res.cloudinary.com/demo/image/upload/logo.webp','#4DA9CE'),(2,'Negocio B','negocio-b',NULL,NULL); INSERT INTO users(id,business_id,name,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES(1,1,'Owner A','a@test.local','hash','OWNER'),(2,2,'Owner B','b@test.local','hash','OWNER')");
    const run=async(sql,params)=>(await db.query(sql,params)).rows;
    const env={NODE_ENV:'development',AUTH_SECRET:secret,PUBLIC_SITE_URL:'https://menu.example.com/'};
    const handler=createAdminQrHandler(run,env,silent);
    assert.equal((await handler(request())).statusCode,401);
    assert.equal((await handler(request(null,'POST'))).statusCode,405);
    const token=await signSession({id:'1',business_id:'1',role:'OWNER'},env);
    const response=await handler(request(token,'GET',{business_id:'2',slug:'negocio-b'}));
    assert.equal(response.statusCode,200);
    const data=body(response);
    assert.deepEqual(data.qr,{
      public_url:'https://menu.example.com/negocio-a',slug:'negocio-a',business_name:'Negocio A',
      logo_url:'https://res.cloudinary.com/demo/image/upload/logo.webp',theme_color:'#4DA9CE',is_local_url:false,
    });
    assert.ok(!JSON.stringify(data).includes('business_id'));
    assert.ok(!JSON.stringify(data).includes('menu_session'));
  }finally{await db.close()}
});

test('FASE 8: endpoint marca red local y falla de forma segura sin URL canónica',async()=>{
  const db=new PGlite();
  try{
    await migrate(adapter(db),undefined,silent);
    await db.exec("INSERT INTO businesses(id,name,slug) OVERRIDING SYSTEM VALUE VALUES(1,'Local','local'); INSERT INTO users(id,business_id,name,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES(1,1,'Owner','owner@test.local','hash','OWNER')");
    const run=async(sql,params)=>(await db.query(sql,params)).rows;
    const base={NODE_ENV:'development',AUTH_SECRET:secret};
    const token=await signSession({id:'1',business_id:'1',role:'OWNER'},base);
    const local=body(await createAdminQrHandler(run,{...base,PUBLIC_SITE_URL:'http://192.168.1.91:8892'},silent)(request(token)));
    assert.equal(local.qr.public_url,'http://192.168.1.91:8892/local');
    assert.equal(local.qr.is_local_url,true);
    const missing=await createAdminQrHandler(run,base,silent)(request(token));
    assert.equal(missing.statusCode,503);
    assert.deepEqual(body(missing),{ok:false,error:'PUBLIC_URL_UNAVAILABLE'});
  }finally{await db.close()}
});

test('FASE 8: QR real codifica exactamente la URL con corrección H y quiet zone',async()=>{
  const publicUrl='https://menu.example.com/negocio-a';
  assert.equal(QR_OPTIONS.errorCorrectionLevel,'H');
  assert.equal(QR_OPTIONS.margin,4);
  assert.deepEqual(QR_OPTIONS.color,{dark:'#111111',light:'#FFFFFF'});
  const generated=QRCode.create(publicUrl,{errorCorrectionLevel:QR_OPTIONS.errorCorrectionLevel});
  const decoder=new TextDecoder();
  assert.equal(generated.segments.map(segment=>typeof segment.data==='string'?segment.data:decoder.decode(segment.data)).join(''),publicUrl);
  const svg=await createQrSvg(publicUrl);
  assert.match(svg,/^<svg/);
  assert.match(svg,/<path/);
});

test('FASE 8: PNG compone logo al 18% sobre respaldo blanco',async()=>{
  const arcs=[];const images=[];
  const context={
    createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),clearRect(){},putImageData(){},save(){},restore(){},beginPath(){},fill(){},clip(){},
    arc:(x,y,r)=>arcs.push([x,y,r]),drawImage:(...args)=>images.push(args),
  };
  const canvas={style:{},getContext:()=>context,toDataURL:type=>`data:${type};base64,QR`};
  const documentRef={createElement:tag=>{assert.equal(tag,'canvas');return canvas}};
  class ImageMock{constructor(){this.naturalWidth=200;this.naturalHeight=100}set src(value){this.source=value;queueMicrotask(()=>this.onload())}}
  const result=await createQrPng('https://menu.example.com/negocio-a','https://res.cloudinary.com/demo/image/upload/logo.webp',{size:100,documentRef,ImageConstructor:ImageMock});
  assert.equal(result.logoIncluded,true);
  assert.equal(result.dataUrl,'data:image/png;base64,QR');
  assert.equal(canvas.width,100);assert.equal(canvas.height,100);
  assert.deepEqual(arcs.map(value=>value.slice(0,2)),[[50,51.5],[50,51.5]]);
  assert.deepEqual(arcs.map(value=>value[2]),[11,9]);
  assert.equal(images.length,1);
  assert.equal(images[0][3],18);
});
