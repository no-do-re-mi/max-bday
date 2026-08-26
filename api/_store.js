import { put, list } from '@vercel/blob';

// Two prefixes, deliberately: the public guest card (name, avatar, +1) and
// the full record (phone, excuse). /api/guests only ever reads PUBLIC, so a
// phone number is never one fetch away from the open web.
export const PUBLIC_PREFIX = 'guests/';
export const PRIVATE_PREFIX = 'rsvps/';

export const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

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
