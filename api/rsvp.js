import { PUBLIC_PREFIX, PRIVATE_PREFIX, configured, putJson, randomId, fail, methodGuard } from './_store.js';

const PRESETS = ['elbow', 'venus', 'hotdog', 'custom'];
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!configured()) return fail(res, 503, 'not_configured');

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body !== 'object') return fail(res, 400, 'bad_request');

  const going = body.going === true;
  const name = clean(body.name, 60).toLowerCase();
  if (!name) return fail(res, 400, 'name_required');

  const phone = going ? clean(body.phone, 24) : '';
  if (going && !phone) return fail(res, 400, 'phone_required');

  const avatar = going && PRESETS.includes(body.avatar) ? body.avatar : null;
  if (going && !avatar) return fail(res, 400, 'avatar_required');

  // Only accept an avatar URL we issued ourselves — never an arbitrary
  // remote image someone pasted into the request.
  const src = avatar === 'custom' && isOwnBlobUrl(body.src) ? body.src : null;
  if (avatar === 'custom' && !src) return fail(res, 400, 'avatar_required');

  const id = randomId();
  const at = Date.now();

  try {
    if (going) {
      await putJson(`${PUBLIC_PREFIX}${id}.json`, {
        id, at, name, avatar, src, plusOne: body.plusOne === true
      });
    }
    await putJson(`${PRIVATE_PREFIX}${id}.json`, {
      id, at, going, name, phone,
      why: going ? '' : clean(body.why, 400),
      plusOne: going ? body.plusOne === true : false,
      avatar, src
    });
    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('rsvp failed', err);
    fail(res, 502, 'write_failed');
  }
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function isOwnBlobUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}
