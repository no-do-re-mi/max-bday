import { put, list, get } from '@vercel/blob';

// Two prefixes, deliberately: the public guest card (name, avatar, +1) and
// the full record (phone, excuse). /api/guests only ever reads PUBLIC, so a
// phone number is never one fetch away from the open web.
export const PUBLIC_PREFIX = 'guests/';
export const PRIVATE_PREFIX = 'rsvps/';
export const AVATAR_PREFIX = 'avatars/';

// Everything is written with private access. Blob stores can be configured to
// refuse public blobs outright, and private works on either kind — so nothing
// in the store is fetchable without our credentials. Avatars still need to
// render in a browser, which /api/avatar handles by streaming them back.
export const ACCESS = 'private';

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

export function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function putJson(pathname, value) {
  return put(pathname, JSON.stringify(value), {
    access: ACCESS,
    contentType: 'application/json',
    addRandomSuffix: true,
    cacheControlMaxAge: 0
  });
}

export async function readJson(pathname) {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || !result.stream) throw new Error(`no readable blob at ${pathname}`);
  return JSON.parse(await new Response(result.stream).text());
}

export async function readAll(prefix) {
  const { blobs } = await list({ prefix, limit: 1000 });
  const settled = await Promise.allSettled(blobs.map((blob) => readJson(blob.pathname)));
  return settled
    .filter((r) => r.status === 'fulfilled' && r.value && typeof r.value === 'object')
    .map((r) => r.value)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

// The browser-facing URL for a stored avatar. Only ever built here, from a
// pathname the server has already validated.
export const avatarUrl = (pathname) => `/api/avatar?p=${encodeURIComponent(pathname)}`;

export function isSafeAvatarPath(value) {
  return typeof value === 'string'
    && value.startsWith(AVATAR_PREFIX)
    && !value.includes('..')
    && /^[A-Za-z0-9/_.-]+$/.test(value);
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
