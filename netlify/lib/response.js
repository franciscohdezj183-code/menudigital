export const HTTP = Object.freeze({ OK: 200, BAD_REQUEST: 400, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405, INTERNAL_ERROR: 500, UNAVAILABLE: 503 });

export function json(body, statusCode = HTTP.OK, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}
