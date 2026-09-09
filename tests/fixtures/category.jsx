// Datos simulados para revisión visual, fuera del build público.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { demoCategories } from '../../scripts/demo-data.js';
import '../../src/styles.css';
const scenario = new URLSearchParams(location.search).get('state') || 'success';
const image = scenario === 'images' ? '/tests/fixtures/image.svg' : scenario === 'broken' ? '/tests/fixtures/not-an-image.png' : null;
const definition = demoCategories.find(category => category.name === 'Preparadas');
const data = {
  ok: true,
  business: {name:'Negocio de prueba visual',slug:'visual-test',logo_url:image},
  category: {id:'9007199254740997',name:scenario==='long'?'Una categoría con un nombre especialmente largo para comprobar la interfaz':'Preparadas',image_url:null},
  products: scenario==='empty'?[]:definition.products.map((p,index)=>({
    ...p,id:String(index+1),available:p.available??true,featured:p.featured??false,image_url:image,sort_order:index,
    ...(scenario==='long'&&index===0?{name:'Nombre de producto extremadamente largo sin truncamiento del precio '.repeat(6),description:'Descripción extensa con detalles '.repeat(20),price:'9999999999.99',featured:true,available:false}:{}),
  })).sort((a,b)=>Number(b.featured)-Number(a.featured)||a.sort_order-b.sort_order),
};
let attempts=0;
window.fetch=async(url)=>{
  if(url.includes('public-menu')) return new Response(JSON.stringify({ok:true,business:data.business,categories:[data.category]}));
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='not-found')return new Response('{"error":"CATEGORY_NOT_FOUND"}',{status:404});
  if(scenario==='business-not-found')return new Response('{"error":"BUSINESS_NOT_FOUND"}',{status:404});
  if(scenario==='error'&&attempts++===0)return new Response('{}',{status:503});
  return new Response(JSON.stringify(data));
};
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/visual-test/categoria/9007199254740997']}><App/></MemoryRouter>);
