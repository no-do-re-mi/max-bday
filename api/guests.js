import { PUBLIC_PREFIX, configured, readAll, methodGuard } from './_store.js';

// One short-lived cache per warm lambda: the guest list is read on every page
// load but changes a handful of times an evening.
const TTL_MS = 10_000;
let cache = { at: 0, guests: null };

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  if (!configured()) {
    res.status(200).json({ guests: [], configured: false });
    return;
  }

  // A guest who just RSVP'd asks for ?fresh=1 so they never get a cached
  // list that predates their own submission.
  const fresh = req.query?.fresh === '1';

  if (!fresh && cache.guests && Date.now() - cache.at < TTL_MS) {
    res.status(200).json({ guests: cache.guests, configured: true, cached: true });
    return;
  }

  try {
    const records = await readAll(PUBLIC_PREFIX);
    const guests = records.map((g) => ({
      id: g.id || null,
      name: String(g.name || '').slice(0, 60),
      avatar: g.avatar || null,
      src: g.src || null,
      plusOne: g.plusOne === true
    }));
    cache = { at: Date.now(), guests };
    res.status(200).json({ guests, configured: true });
  } catch (err) {
    console.error('guests failed', err);
    res.status(502).json({ error: 'read_failed' });
  }
}
