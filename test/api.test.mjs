import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

/* ── in-memory stand-in for Vercel Blob ─────────────────────── */
const store = new Map(); // url -> { pathname, body, contentType }
const HOST = 'https://fake123.public.blob.vercel-storage.com/';
let putCalls = 0;

function fakePut(pathname, body, opts = {}) {
  putCalls++;
  const suffix = opts.addRandomSuffix ? '-' + Math.random().toString(36).slice(2, 8) : '';
  const dot = pathname.lastIndexOf('.');
  const stamped = dot > 0 ? pathname.slice(0, dot) + suffix + pathname.slice(dot) : pathname + suffix;
  const url = HOST + stamped;
  store.set(url, { pathname: stamped, body, contentType: opts.contentType });
  return Promise.resolve({ url, pathname: stamped });
}

function fakeList({ prefix = '' } = {}) {
  return Promise.resolve({
    blobs: [...store.entries()]
      .filter(([, v]) => v.pathname.startsWith(prefix))
      .map(([url, v]) => ({ url, pathname: v.pathname }))
  });
}

mock.module('@vercel/blob', { namedExports: { put: fakePut, list: fakeList } });

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (store.has(url)) {
    const { body, contentType } = store.get(url);
    return Promise.resolve(new Response(body, { headers: { 'content-type': contentType || 'text/plain' } }));
  }
  if (url.startsWith(HOST)) return Promise.resolve(new Response('not found', { status: 404 }));
  return realFetch(input, init);
};

process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
process.env.ADMIN_KEY = 'let-me-in';

const rsvp   = (await import('../api/rsvp.js')).default;
const guests = (await import('../api/guests.js')).default;
const upload = (await import('../api/upload.js')).default;
const admin  = (await import('../api/admin.js')).default;

function mockRes() {
  const res = {
    statusCode: 0, body: null, headers: {},
    status(c) { res.statusCode = c; return res; },
    json(b) { res.body = b; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; }
  };
  return res;
}
const call = async (handler, req) => { const res = mockRes(); await handler(req, res); return res; };
const post = (body) => ({ method: 'POST', body, headers: {}, query: {} });
const get  = (query = {}, headers = {}) => ({ method: 'GET', headers, query });

const GOING = { going: true, name: 'Noemie', phone: '(212) 555-0142', plusOne: true, avatar: 'hotdog' };

/* ── rsvp validation ────────────────────────────────────────── */

test('rejects non-POST with Allow header', async () => {
  const res = await call(rsvp, { method: 'GET', headers: {}, query: {} });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

test('rejects a going RSVP with no name', async () => {
  const res = await call(rsvp, post({ ...GOING, name: '   ' }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'name_required');
});

test('rejects a going RSVP with no phone', async () => {
  const res = await call(rsvp, post({ ...GOING, phone: '' }));
  assert.equal(res.body.error, 'phone_required');
});

test('rejects a going RSVP with an unknown avatar', async () => {
  const res = await call(rsvp, post({ ...GOING, avatar: 'javascript:alert(1)' }));
  assert.equal(res.body.error, 'avatar_required');
});

test('rejects a custom avatar pointing at someone else\'s host', async () => {
  const res = await call(rsvp, post({ ...GOING, avatar: 'custom', src: 'https://evil.example.com/x.png' }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'avatar_required');
});

test('accepts a custom avatar on our own blob host', async () => {
  const res = await call(rsvp, post({ ...GOING, avatar: 'custom', src: HOST + 'avatars/a.jpg' }));
  assert.equal(res.statusCode, 201);
});

test('parses a stringified JSON body', async () => {
  const res = await call(rsvp, post(JSON.stringify({ ...GOING, name: 'string body' })));
  assert.equal(res.statusCode, 201);
});

test('rejects a malformed body', async () => {
  const res = await call(rsvp, post('not json'));
  assert.equal(res.statusCode, 400);
});

/* ── the going path ─────────────────────────────────────────── */

test('a going RSVP writes both a public card and a private record', async () => {
  store.clear();
  putCalls = 0;
  const res = await call(rsvp, post(GOING));
  assert.equal(res.statusCode, 201);
  assert.equal(putCalls, 2);
  const paths = [...store.values()].map((v) => v.pathname);
  assert.equal(paths.filter((p) => p.startsWith('guests/')).length, 1);
  assert.equal(paths.filter((p) => p.startsWith('rsvps/')).length, 1);
});

test('the public card carries no phone number', async () => {
  const card = [...store.values()].find((v) => v.pathname.startsWith('guests/'));
  const parsed = JSON.parse(card.body);
  assert.equal(parsed.name, 'noemie');           // normalised to lowercase
  assert.equal(parsed.plusOne, true);
  assert.equal('phone' in parsed, false);
  assert.equal('why' in parsed, false);
});

/* ── the not-going path ─────────────────────────────────────── */

test('a decline is recorded privately and never reaches the guest list', async () => {
  store.clear();
  const res = await call(rsvp, post({ going: false, name: 'Sam', why: 'i will be on venus' }));
  assert.equal(res.statusCode, 201);
  const paths = [...store.values()].map((v) => v.pathname);
  assert.equal(paths.filter((p) => p.startsWith('guests/')).length, 0);
  assert.equal(paths.filter((p) => p.startsWith('rsvps/')).length, 1);
});

test('a decline needs a name but not a phone', async () => {
  assert.equal((await call(rsvp, post({ going: false, name: '' }))).body.error, 'name_required');
  assert.equal((await call(rsvp, post({ going: false, name: 'kate' }))).statusCode, 201);
});

/* ── guest list ─────────────────────────────────────────────── */

test('guests returns only public fields, oldest first', async () => {
  store.clear();
  await call(rsvp, post({ ...GOING, name: 'first' }));
  await new Promise((r) => setTimeout(r, 5));
  await call(rsvp, post({ ...GOING, name: 'second', plusOne: false, avatar: 'venus' }));
  await call(rsvp, post({ going: false, name: 'declined', why: 'busy' }));

  const res = await call(guests, get());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.guests.map((g) => g.name), ['first', 'second']);
  assert.deepEqual(Object.keys(res.body.guests[0]).sort(), ['avatar', 'id', 'name', 'plusOne', 'src']);
  assert.ok(res.body.guests[0].id, 'each guest carries the id the client dedupes on');
  assert.equal(res.body.guests[1].plusOne, false);
});

/* ── upload ─────────────────────────────────────────────────── */

const PIXEL = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');

test('upload stores an image and returns its url', async () => {
  const res = await call(upload, post({ dataUrl: PIXEL }));
  assert.equal(res.statusCode, 201);
  assert.match(res.body.url, /^https:\/\/.*\.public\.blob\.vercel-storage\.com\/avatars\//);
});

test('upload rejects a non-image data url', async () => {
  const bad = 'data:text/html;base64,' + Buffer.from('<script>').toString('base64');
  assert.equal((await call(upload, post({ dataUrl: bad }))).statusCode, 415);
});

test('upload rejects a malformed data url', async () => {
  assert.equal((await call(upload, post({ dataUrl: 'https://example.com/x.png' }))).statusCode, 400);
});

test('upload rejects an oversized image', async () => {
  const huge = 'data:image/png;base64,' + Buffer.alloc(700_000).toString('base64');
  assert.equal((await call(upload, post({ dataUrl: huge }))).statusCode, 413);
});

/* ── admin ──────────────────────────────────────────────────── */

test('admin refuses a missing or wrong key', async () => {
  assert.equal((await call(admin, get())).statusCode, 401);
  assert.equal((await call(admin, get({ key: 'nope' }))).statusCode, 401);
  assert.equal((await call(admin, get({ key: 'let-me-in-longer' }))).statusCode, 401);
});

test('admin returns full records and a headcount that counts plus-ones', async () => {
  store.clear();
  await call(rsvp, post({ ...GOING, name: 'a', plusOne: true }));
  await call(rsvp, post({ ...GOING, name: 'b', plusOne: false }));
  await call(rsvp, post({ going: false, name: 'c', why: 'on venus' }));

  const res = await call(admin, get({ key: 'let-me-in' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.headcount, 3);          // 2 going + 1 plus-one
  assert.equal(res.body.going.length, 2);
  assert.equal(res.body.notGoing.length, 1);
  assert.equal(res.body.going[0].phone, '(212) 555-0142');
  assert.equal(res.body.notGoing[0].why, 'on venus');
});

test('admin works via the x-admin-key header', async () => {
  assert.equal((await call(admin, get({}, { 'x-admin-key': 'let-me-in' }))).statusCode, 200);
});

/* ── unconfigured store ─────────────────────────────────────── */

test('without a blob token, guests is empty and rsvp reports not_configured', async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const g = await call(guests, get());
  assert.equal(g.statusCode, 200);
  assert.deepEqual(g.body, { guests: [], configured: false });
  assert.equal((await call(rsvp, post(GOING))).statusCode, 503);
  assert.equal((await call(upload, post({ dataUrl: PIXEL }))).statusCode, 503);
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
});
