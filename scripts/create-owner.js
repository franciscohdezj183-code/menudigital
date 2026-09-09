import { pathToFileURL } from 'node:url';
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { getDatabaseUrl } from '../netlify/lib/config.js';
import { readSlug } from '../netlify/lib/public-params.js';
import { normalizeEmail, validOwnerPassword, hashPassword } from '../netlify/lib/passwords.js';
import { logServerError } from '../netlify/lib/errors.js';
export async function createOwner(client, env = process.env) {
  const name = typeof env.OWNER_NAME === 'string' ? env.OWNER_NAME.trim() : '';
  const email = normalizeEmail(env.OWNER_EMAIL);
  const slug = readSlug({ queryStringParameters: { slug: env.OWNER_BUSINESS_SLUG } });
  if (!name || name.length > 120 || !email || !slug || !validOwnerPassword(env.OWNER_PASSWORD)) throw new Error('Variables OWNER inválidas: revisa nombre, email, slug y política de contraseña.');
  const { rows: businesses } = await client.query('SELECT id::text AS id FROM businesses WHERE slug = $1 AND active = TRUE', [slug]);
  if (!businesses.length) throw new Error('No existe un negocio activo para el OWNER.');
  const { rows: existing } = await client.query('SELECT id::text AS id FROM users WHERE lower(email) = $1', [email]);
  if (existing.length) return false;
  const hash = await hashPassword(env.OWNER_PASSWORD);
  const { rows } = await client.query(`
    INSERT INTO users(business_id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,'OWNER')
    ON CONFLICT (lower(email)) DO NOTHING RETURNING id::text AS id
  `, [businesses[0].id, name, email, hash]);
  return rows.length > 0;
}
async function main() {
  neonConfig.webSocketConstructor = ws;
  const client = new Client({ connectionString: getDatabaseUrl(), connectionTimeoutMillis: 10000, query_timeout: 30000 });
  try {
    await client.connect();
    console.log(await createOwner(client) ? 'OWNER creado correctamente.' : 'Owner already exists. No se modificó.');
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  logServerError('create-owner', error);
  console.error('No se creó el OWNER. Revisa las variables OWNER, la política de contraseña, negocio activo y migraciones.');
  process.exitCode = 1;
});
