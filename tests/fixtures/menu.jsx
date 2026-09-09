// Banco visual exclusivo de pruebas. Vite no lo incluye en dist.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';

const scenario = new URLSearchParams(location.search).get('state') || 'success';
const image = scenario === 'photo' ? '/tests/fixtures/beer-photo.jpg' : scenario === 'images' ? '/tests/fixtures/image.svg' : scenario === 'broken' ? '/tests/fixtures/missing-image.png' : null;
const long = scenario === 'long';
const menu = {
  ok: true,
  business: {
    name: long ? 'Un negocio con un nombre extraordinariamente largo para comprobar el diseño' : 'Negocio de prueba visual',
    slug: 'visual-test',
    description: long ? 'Descripción extensa para comprobar que la presentación mantiene su tamaño y la legibilidad. '.repeat(30) : 'Bebidas, comida y algo para compartir.',
    address: long ? 'Una dirección larguísima sin espacios '.repeat(12) : 'Centro, Ciudad de México',
    cover_url: image, logo_url: scenario === 'photo' ? '/tests/fixtures/image.svg' : image,
  },
  categories: scenario === 'empty' ? [] : ['Para compartir', 'Bebidas', 'De la cocina', 'Especialidades'].map((name, index) => ({
    id: String(index + 1), name: long && index === 0 ? 'CategoríaConUnNombreMuyLargoSinEspacios'.repeat(5) : name,
    image_url: image, sort_order: index,
  })),
};
let attempts = 0;
window.fetch = async () => {
  if (scenario === 'loading') return new Promise(() => {});
  if (scenario === 'not-found') return new Response('{}', { status: 404 });
  if (scenario === 'error' && attempts++ === 0) return new Response('{}', { status: 503 });
  return new Response(JSON.stringify(menu), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/visual-test']}><App /></MemoryRouter>);
