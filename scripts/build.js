// Una .env local con NODE_ENV=development no debe generar bundles de desarrollo.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
