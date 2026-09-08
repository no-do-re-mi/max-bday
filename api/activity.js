import {
  ACTIVITY_PREFIX, PRIVATE_PREFIX, configured, putJson, readAll,
  randomId, normalizeName, fail, methodGuard
} from './_store.js';

const HOURS = [5, 6, 7];

// Records who is coming to the structured activity, and joins it to the
// guest's existing RSVP by name where one exists. An unmatched response is
// still stored — better a response we have to reconcile by hand than a lost one.
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
    const match = await findRsvp(name);
    await putJson(`${ACTIVITY_PREFIX}${id}.json`, {
      id, at,
      name: name.toLowerCase(),
      activityStart: skipped ? null : startsAt,
      skipped,
      rsvpId: match ? match.id : null,
      matched: Boolean(match)
    });
    res.status(201).json({ ok: true, id, matched: Boolean(match) });
  } catch (err) {
    console.error('activity write failed', err);
    fail(res, 502, 'write_failed');
  }
}

// Only a single unambiguous match counts. Two guests with the same name is a
// tie we can't break here, so it's left for the host to sort out.
async function findRsvp(name) {
  const target = normalizeName(name);
  if (!target) return null;
  const records = await readAll(PRIVATE_PREFIX);
  const hits = records.filter((r) => r.going && normalizeName(r.name) === target);
  return hits.length === 1 ? hits[0] : null;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
