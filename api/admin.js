import {
  PRIVATE_PREFIX, ACTIVITY_PREFIX, configured, readAll, deleteRsvp, isSafeId,
  normalizeName, fail, requireAdmin
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
    const [all, activity] = await Promise.all([
      readAll(PRIVATE_PREFIX),
      readAll(ACTIVITY_PREFIX).catch(() => [])
    ]);
    const going = all.filter((r) => r.going);

    // Latest answer wins, so someone who changes their mind just re-submits.
    const byRsvp = new Map();
    const byName = new Map();
    for (const a of activity) {
      if (a.rsvpId) byRsvp.set(a.rsvpId, a);   // older replies carry one
      byName.set(normalizeName(a.name), a);
    }

    // Two guests sharing a name is a tie this can't break, so neither gets
    // the answer — it surfaces as unmatched for the host to sort out, rather
    // than being pinned on the wrong person.
    const nameCount = new Map();
    for (const r of going) {
      const k = normalizeName(r.name);
      nameCount.set(k, (nameCount.get(k) || 0) + 1);
    }
    const answerFor = (r) => {
      const byId = byRsvp.get(r.id);
      if (byId) return byId;
      const k = normalizeName(r.name);
      return nameCount.get(k) === 1 ? byName.get(k) || null : null;
    };

    const withActivity = going.map((r) => {
      const a = answerFor(r);
      return { ...r, activityStart: a ? a.activityStart : undefined,
               activitySkipped: a ? a.skipped : undefined };
    });

    const claimed = new Set(withActivity.map((r) => answerFor(r)).filter(Boolean).map((a) => a.id));

    res.status(200).json({
      total: all.length,
      headcount: going.length + going.filter((r) => r.plusOne).length,
      going: withActivity,
      notGoing: all.filter((r) => !r.going),
      activity: {
        joining: activity.filter((a) => !a.skipped).length,
        skipping: activity.filter((a) => a.skipped).length,
        byHour: [5, 6, 7].map((h) => ({ hour: h, count: activity.filter((a) => a.activityStart === h).length })),
        unmatched: activity.filter((a) => !claimed.has(a.id))
      }
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
