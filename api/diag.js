import { list, del } from '@vercel/blob';
import { credentialSources, configured, putJson, readJson, randomId, methodGuard, requireAdmin } from './_store.js';

// A real end-to-end check of the blob store: write, read back, list, clean up.
// Reports which credential env vars are present (never their values) and the
// SDK's actual error when something fails, so a misconfigured store doesn't
// have to be diagnosed by guesswork.
export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;
  if (!requireAdmin(req, res)) return;

  const env = credentialSources();
  const steps = [];
  let ok = true;

  const run = async (step, fn) => {
    try {
      const detail = await fn();
      steps.push({ step, ok: true, detail: detail ?? null });
      return detail;
    } catch (err) {
      ok = false;
      steps.push({ step, ok: false, error: String(err && err.message).slice(0, 300) });
      return null;
    }
  };

  const pathname = `diag/${randomId()}.json`;
  const token = randomId();

  const written = await run('write', async () => await putJson(pathname, { token }));

  if (written) {
    await run('read back', async () => {
      const body = await readJson(written.pathname);
      if (body.token !== token) throw new Error('blob contents did not round-trip');
      return 'contents match';
    });
    await run('list', async () => `${(await list({ prefix: 'diag/' })).blobs.length} blob(s) under diag/`);
    await run('clean up', async () => { await del(written.url); return 'deleted'; });
  }

  res.status(ok ? 200 : 500).json({
    ok,
    storageConfigured: configured(),
    adminKeySet: true,
    credentials: env,
    steps,
    hint: ok
      ? 'Storage is working end to end.'
      : 'Check the error above. Credentials come from BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID plus VERCEL_OIDC_TOKEN.'
  });
}
