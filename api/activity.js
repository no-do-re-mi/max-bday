import {
  ACTIVITY_PREFIX, configured, putJson, randomId, fail, methodGuard
} from './_store.js';

const HOURS = [5, 6, 7];

// Records who is coming to the structured activity. Deliberately does one
// thing: write a single blob. It used to read every RSVP first to stamp the
// matching guest's id on the reply, which meant tens of storage round-trips
// on a request made from someone's phone — and /api/admin matches these to
// guests by name when it reads them anyway, so the scan bought nothing and
// only added ways to fail.
export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!configured()) return fail(res, 503, 'not_configured');

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body !== 'object') return fail(res, 400, 'bad_request');

  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return fail(res, 400, 'name_required');

  const skipped = body.skipped === true;
  const startsAt = HOURS.includes(Number(body.activityStart)) ? Number(body.activityStart) : null;
  if (!skipped && startsAt === null) return fail(res, 400, 'time_required');

  const id = randomId();
  const at = Date.now();

  try {
    await putJson(`${ACTIVITY_PREFIX}${id}.json`, {
      id, at,
      name: name.toLowerCase(),
      activityStart: skipped ? null : startsAt,
      skipped
    });
    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('activity write failed', err);
    fail(res, 502, 'write_failed');
  }
}


function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
