import { demoCategories, demoVariants } from './demo-data.js';
import { pathToFileURL } from 'node:url';
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { getDatabaseUrl } from '../netlify/lib/config.js';
import { logServerError } from '../netlify/lib/errors.js';

export async function seedDevelopment(client, env = process.env) {
  if (env.NODE_ENV !== 'development' || env.CONTEXT === 'production') {
    throw new Error('El seed solo se permite con NODE_ENV=development fuera de producción.');
  }
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(724019, 2)');
    const { rows } = await client.query(`
      INSERT INTO businesses (name, slug, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `, ['Negocio Demo', 'negocio-demo', 'Un menú de demostración.']);
    const { rows: businesses } = await client.query('SELECT id, name FROM businesses WHERE slug = $1', ['negocio-demo']);
    const business = businesses[0];
    if (business.name !== 'Negocio Demo') throw new Error('El slug demo pertenece a otro negocio; no se modificó.');
    let changed = rows.length > 0;
    for (const [index, definition] of demoCategories.entries()) {
      const { rows: existing } = await client.query('SELECT id FROM categories WHERE business_id = $1 AND name = $2', [business.id, definition.name]);
      if (existing.length > 1) throw new Error('Categoría demo ambigua; revisa los registros existentes.');
      let category = existing[0];
      if (!category) {
        const { rows: created } = await client.query('INSERT INTO categories (business_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id', [business.id, definition.name, index + 1]);
        category = created[0];
        changed = true;
      }
      for (const [order, product] of definition.products.entries()) {
        const { rows: inserted } = await client.query(`
          INSERT INTO products (business_id, category_id, name, description, price, available, featured, sort_order)
          SELECT $1, $2, $3, $4, $5, $6, $7, $8
          WHERE NOT EXISTS (
            SELECT 1 FROM products WHERE business_id = $1 AND category_id = $2 AND name = $3
          ) RETURNING id
        `, [business.id, category.id, product.name, product.description, product.price, product.available ?? true, product.featured ?? false, order + 1]);
        changed ||= inserted.length > 0;
        const variants = demoVariants[product.name] ?? [];
        if (!variants.length) continue;
        const { rows: matches } = await client.query('SELECT id FROM products WHERE business_id = $1 AND category_id = $2 AND name = $3', [business.id, category.id, product.name]);
        if (matches.length !== 1) throw new Error('Producto demo ambiguo; revisa los registros existentes.');
        for (const [variantOrder, variant] of variants.entries()) {
          const { rows: added } = await client.query(`
            INSERT INTO product_variants (business_id, product_id, name, price, sort_order, active)
            SELECT $1, $2, $3, $4, $5, $6
            WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE business_id = $1 AND product_id = $2 AND name = $3)
            RETURNING id
          `, [business.id, matches[0].id, variant.name, variant.price, variantOrder + 1, variant.active ?? true]);
          changed ||= added.length > 0;
        }
      }
    }
    await client.query('COMMIT');
    return changed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  if (process.env.NODE_ENV !== 'development' || process.env.CONTEXT === 'production') {
    throw new Error('El seed es exclusivo de desarrollo.');
  }
  neonConfig.webSocketConstructor = ws;
  const client = new Client({ connectionString: getDatabaseUrl(), connectionTimeoutMillis: 10000, query_timeout: 30000 });
  try {
    await client.connect();
    const created = await seedDevelopment(client);
    console.log(created ? 'Datos demo completados: cuatro categorías, catorce productos y once variantes. Se conservaron los registros existentes.' : 'Sin datos demo pendientes. No se modificaron registros existentes.');
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    logServerError('seed-dev', error);
    console.error('No se completó el seed. Revisa el entorno de desarrollo, DATABASE_URL y las migraciones.');
    process.exitCode = 1;
  });
}

