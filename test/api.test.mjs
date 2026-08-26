import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

/* ── in-memory stand-in for Vercel Blob ─────────────────────── */
const store = new Map(); // url -> { pathname, body, contentType }
const HOST = 'https://fake123.public.blob.vercel-storage.com/';
let putCalls = 0;

// swappable so a test can make the store reject a write
const fakePutRef = { fn: null };

function fakePut(pathname, body, opts = {}) {
  if (fakePutRef.fn) return fakePutRef.fn(pathname, body, opts);
  if (opts.access !== 'private') {
    return Promise.reject(new Error(
      'Vercel Blob: Cannot use public access on a private store. The store is configured with private access.'
    ));
  }
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

function fakeDel(url) { store.delete(url); return Promise.resolve(); }

// Private-store semantics: content is reachable only through get(), by
// pathname, with credentials — never by fetching the URL.
function fakeGet(pathname, opts = {}) {
  if (opts.access !== 'private') {
    return Promise.reject(new Error('Vercel Blob: Cannot use public access on a private store.'));
  }
  const hit = [...store.values()].find((v) => v.pathname === pathname);
  if (!hit) return Promise.resolve(null);
  return Promise.resolve({
    statusCode: 200,
    stream: new Response(hit.body).body,
    blob: { pathname, contentType: hit.contentType || 'application/octet-stream' }
  });
}

mock.module('@vercel/blob', {
  namedExports: { put: fakePut, list: fakeList, del: fakeDel, get: fakeGet }
});

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  // A private blob is never readable by URL, even if you know it.
  if (url.startsWith(HOST)) return Promise.resolve(new Response('forbidden', { status: 403 }));
  return realFetch(input, init);
};

process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
process.env.ADMIN_KEY = 'let-me-in';

const rsvp   = (await import('../api/rsvp.js')).default;
const guests = (await import('../api/guests.js')).default;
const upload = (await import('../api/upload.js')).default;
const admin  = (await import('../api/admin.js')).default;
const diag   = (await import('../api/diag.js')).default;
const avatar = (await import('../api/avatar.js')).default;
const { configured } = await import('../api/_store.js');

function mockRes() {
  const res = {
    statusCode: 0, body: null, payload: null, headers: {},
    status(c) { res.statusCode = c; return res; },
    json(b) { res.body = b; return res; },
    end(b) { res.payload = b; return res; },
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

test('rejects a custom avatar path outside avatars/', async () => {
  for (const bad of ['rsvps/secret.json', '../rsvps/secret.json', 'avatars/../rsvps/x.json',
                     'https://evil.example.com/x.png', '', null]) {
    const res = await call(rsvp, post({ ...GOING, avatar: 'custom', avatarPath: bad }));
    assert.equal(res.statusCode, 400, `should reject ${JSON.stringify(bad)}`);
    assert.equal(res.body.error, 'avatar_required');
  }
});

test('accepts a custom avatar path inside avatars/, and builds the URL itself', async () => {
  store.clear();
  const res = await call(rsvp, post({ ...GOING, avatar: 'custom', avatarPath: 'avatars/a-1.jpg' }));
  assert.equal(res.statusCode, 201);
  const card = JSON.parse([...store.values()].find((v) => v.pathname.startsWith('guests/')).body);
  assert.equal(card.src, '/api/avatar?p=avatars%2Fa-1.jpg');
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


/* ── credential detection ───────────────────────────────────── */

function withEnv(env, fn) {
  const saved = {};
  const keys = ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN'];
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  try { return fn(); }
  finally {
    for (const k of keys) { delete process.env[k]; if (saved[k] !== undefined) process.env[k] = saved[k]; }
  }
}

test('a read-write token counts as configured', () => {
  assert.equal(withEnv({ BLOB_READ_WRITE_TOKEN: 'tok' }, configured), true);
});

// The bug this fixes: connecting a store without ticking "add a read-write
// token" leaves only OIDC, which the SDK accepts but configured() rejected.
test('OIDC credentials count as configured', () => {
  assert.equal(withEnv({ BLOB_STORE_ID: 'store_abc', VERCEL_OIDC_TOKEN: 'jwt' }, configured), true);
});

test('a store id with no OIDC token is not configured', () => {
  assert.equal(withEnv({ BLOB_STORE_ID: 'store_abc' }, configured), false);
});

test('no credentials at all is not configured', () => {
  assert.equal(withEnv({}, configured), false);
});

/* ── diagnostics ────────────────────────────────────────────── */

test('diag refuses without the admin key', async () => {
  const saved = process.env.ADMIN_KEY;
  delete process.env.ADMIN_KEY;
  assert.equal((await call(diag, get({ key: 'anything' }))).statusCode, 503);
  process.env.ADMIN_KEY = saved;
  assert.equal((await call(diag, get({ key: 'nope' }))).statusCode, 401);
  assert.equal((await call(diag, get())).statusCode, 401);
});

test('diag round-trips a blob and cleans up after itself', async () => {
  store.clear();
  const res = await call(diag, get({ key: 'let-me-in' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.steps.map((s) => s.step), ['write', 'read back', 'list', 'clean up']);
  assert.ok(res.body.steps.every((s) => s.ok), 'every step should pass');
  assert.equal(store.size, 0, 'the diagnostic blob should be deleted again');
});

test('diag reports which credentials are present, never their values', async () => {
  const res = await call(diag, get({ key: 'let-me-in' }));
  assert.deepEqual(Object.keys(res.body.credentials).sort(),
    ['BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL_OIDC_TOKEN']);
  for (const v of Object.values(res.body.credentials)) assert.equal(typeof v, 'boolean');
  assert.ok(!JSON.stringify(res.body).includes('test-token'), 'must not leak the token value');
});

test('diag surfaces the real error when the store rejects a write', async () => {
  fakePutRef.fn = () => Promise.reject(
    new Error('Vercel Blob: public access is not allowed on this store')
  );
  const res = await call(diag, get({ key: 'let-me-in' }));
  fakePutRef.fn = null;
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  const write = res.body.steps.find((s) => s.step === 'write');
  assert.match(write.error, /public access is not allowed/);
  assert.match(res.body.hint, /BLOB_READ_WRITE_TOKEN|VERCEL_OIDC_TOKEN/);
});


/* ── avatar proxy ───────────────────────────────────────────── */

test('upload returns a path and a proxy url, and stores privately', async () => {
  store.clear();
  const res = await call(upload, post({ dataUrl: PIXEL }));
  assert.equal(res.statusCode, 201);
  assert.match(res.body.path, /^avatars\//);
  assert.equal(res.body.url, `/api/avatar?p=${encodeURIComponent(res.body.path)}`);
  assert.ok(!res.body.url.startsWith('http'), 'must not hand out a raw blob URL');
});

test('the avatar proxy streams a stored image back', async () => {
  store.clear();
  const up = await call(upload, post({ dataUrl: PIXEL }));
  const res = await call(avatar, get({ p: up.body.path }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  assert.match(res.headers['Cache-Control'], /immutable/);
  assert.equal(res.payload.toString(), 'fake-jpeg-bytes');
});

test('the avatar proxy refuses to serve anything outside avatars/', async () => {
  store.clear();
  await call(rsvp, post({ ...GOING, name: 'private person', phone: '555' }));
  const record = [...store.values()].find((v) => v.pathname.startsWith('rsvps/'));
  for (const bad of [record.pathname, 'rsvps/', '../rsvps/x.json', 'avatars/../rsvps/x.json', '']) {
    const res = await call(avatar, get({ p: bad }));
    assert.equal(res.statusCode, 400, `should refuse ${JSON.stringify(bad)}`);
  }
});

test('the avatar proxy 404s a path that does not exist', async () => {
  const res = await call(avatar, get({ p: 'avatars/nope.jpg' }));
  assert.equal(res.statusCode, 404);
});
