import { get } from '@vercel/blob';
import { ACCESS, configured, isSafeAvatarPath, fail, methodGuard } from './_store.js';

// Avatars live in the store as private blobs, so the browser can't fetch them
// directly. This streams one back by pathname. No auth: these are the faces
// already shown on the public guest list. The store itself stays unreadable
// without credentials, and only avatars/ can be reached through here.
export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;
  if (!configured()) return fail(res, 503, 'not_configured');

  const pathname = String(req.query?.p || '');
  if (!isSafeAvatarPath(pathname)) return fail(res, 400, 'bad_path');

  try {
    const result = await get(pathname, { access: ACCESS });
    if (!result || !result.stream) return fail(res, 404, 'not_found');

    res.setHeader('Content-Type', result.blob?.contentType || 'application/octet-stream');
    // Pathnames carry a random suffix and are never reused, so this is safe.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    res.status(200).end(buffer);
  } catch (err) {
    console.error('avatar read failed', err);
    fail(res, 502, 'read_failed');
  }
}
