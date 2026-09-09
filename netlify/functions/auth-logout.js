import { json } from '../lib/response.js';
import { sessionCookie, checkSameOrigin, authFailure } from '../lib/auth.js';
export function createLogoutHandler(env = process.env) {
  return async event => {
    if (event.httpMethod !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
    try { checkSameOrigin(event, env); return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', env, true) }); }
    catch (error) { return authFailure(error, 'auth.logout'); }
  };
}
export const handler = createLogoutHandler();
