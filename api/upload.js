import { put } from '@vercel/blob';
import { ACCESS, AVATAR_PREFIX, avatarUrl, configured, randomId, fail, methodGuard } from './_store.js';

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 600_000; // the client downscales to a 256px square first

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!configured()) return fail(res, 503, 'not_configured');

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const dataUrl = body && typeof body.dataUrl === 'string' ? body.dataUrl : '';

  const match = /^data:([\w/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return fail(res, 400, 'bad_image');

  const ext = ALLOWED[match[1]];
  if (!ext) return fail(res, 415, 'unsupported_type');

  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) return fail(res, 413, 'image_too_large');

  try {
    const blob = await put(`${AVATAR_PREFIX}${randomId()}.${ext}`, bytes, {
      access: ACCESS,
      contentType: match[1],
      addRandomSuffix: true
    });
    res.status(201).json({ path: blob.pathname, url: avatarUrl(blob.pathname) });
  } catch (err) {
    console.error('upload failed', err);
    fail(res, 502, 'upload_failed');
  }
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
