import { HTTP, json } from './response.js';

export function logServerError(context, error) {
  // Mensajes y stacks del driver pueden incluir credenciales o SQL: no registrarlos.
  const code = /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'UNAVAILABLE';
  console.error(JSON.stringify({ context, code }));
}

export function internalError(error) {
  logServerError('api', error);
  return json({ ok: false, error: 'Error interno del servidor.' }, HTTP.INTERNAL_ERROR);
}
