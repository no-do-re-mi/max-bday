import { PRIVATE_PREFIX, configured, readAll, fail, methodGuard, requireAdmin } from './_store.js';

// The host's view: every RSVP with phone numbers and excuses.
// Guarded by ADMIN_KEY — /api/admin?key=…  (or an x-admin-key header).
export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  if (!requireAdmin(req, res)) return;
  if (!configured()) return fail(res, 503, 'not_configured');

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

