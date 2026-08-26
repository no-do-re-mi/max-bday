import { put, list } from '@vercel/blob';

// Two prefixes, deliberately: the public guest card (name, avatar, +1) and
// the full record (phone, excuse). /api/guests only ever reads PUBLIC, so a
// phone number is never one fetch away from the open web.
export const PUBLIC_PREFIX = 'guests/';
export const PRIVATE_PREFIX = 'rsvps/';

// The SDK accepts either a read-write token or OIDC (a store id plus the
// OIDC token Vercel injects). Connecting a store without ticking "add a
// read-write token" leaves only the OIDC path, so checking for the token
// alone reports "not configured" on a store that works fine.
export const configured = () =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN) ||
  Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN);

export function credentialSources() {
  return {
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    BLOB_STORE_ID: Boolean(process.env.BLOB_STORE_ID),
    VERCEL_OIDC_TOKEN: Boolean(process.env.VERCEL_OIDC_TOKEN)
  };
}

// Shared by /api/admin and /api/diag.
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) { fail(res, 503, 'admin_key_not_set'); return false; }
  const provided = String(req.headers['x-admin-key'] || req.query?.key || '');
  if (!timingSafeEqual(provided, expected)) { fail(res, 401, 'unauthorized'); return false; }
  return true;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function putJson(pathname, value) {
  return put(pathname, JSON.stringify(value), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true,
    cacheControlMaxAge: 0
  });
}

export async function readAll(prefix) {
  const { blobs } = await list({ prefix, limit: 1000 });
  const settled = await Promise.allSettled(
    blobs.map((blob) => fetch(blob.url, { cache: 'no-store' }).then((r) => r.json()))
  );
  return settled
    .filter((r) => r.status === 'fulfilled' && r.value && typeof r.value === 'object')
    .map((r) => r.value)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

export function fail(res, status, error) {
  res.status(status).json({ error });
}

export function methodGuard(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  fail(res, 405, 'method_not_allowed');
  return false;
}
