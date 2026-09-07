import {
  PRIVATE_PREFIX, configured, readAll, deleteRsvp, isSafeId,
  fail, requireAdmin
} from './_store.js';

// The host's view: every RSVP with phone numbers and excuses, plus the ability
// to remove one. Guarded by ADMIN_KEY — see requireAdmin.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    return fail(res, 405, 'method_not_allowed');
  }
  if (!requireAdmin(req, res)) return;
  if (!configured()) return fail(res, 503, 'not_configured');

  return req.method === 'DELETE' ? remove(req, res) : listAll(res);
}

async function listAll(res) {
  try {
    const all = await readAll(PRIVATE_PREFIX);
    const going = all.filter((r) => r.going);
    res.status(200).json({
      total: all.length,
      headcount: going.length + going.filter((r) => r.plusOne).length,
      going,
      notGoing: all.filter((r) => !r.going)
    });
  } catch (err) {
    console.error('admin read failed', err);
    fail(res, 502, 'read_failed');
  }
}

async function remove(req, res) {
  const id = String(req.query?.id || '');
  if (!isSafeId(id)) return fail(res, 400, 'bad_id');

  try {
    const result = await deleteRsvp(id);
    if (!result.found) return fail(res, 404, 'not_found');
    res.status(200).json({ ok: true, id, removed: result.removed.length });
  } catch (err) {
    console.error('admin delete failed', err);
    fail(res, 502, 'delete_failed');
  }
}
