import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildActivityPage } from '../scripts/build-activity.mjs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// activity.html is generated, not hand-maintained. If someone edits
// index.html and forgets to regenerate, the two silently diverge and the
// activity page quietly stops matching the invite — so fail here instead.
test('activity.html is in sync with index.html', () => {
  assert.equal(read('activity.html'), buildActivityPage(read('index.html')),
    'run `npm run build:activity` after editing index.html');
});

test('the two pages differ only in their page-identity block', () => {
  const strip = (h) => h.replace(/<!-- page-identity:start -->[\s\S]*<!-- page-identity:end -->/, 'IDENTITY');
  assert.equal(strip(read('activity.html')), strip(read('index.html')));
});

test('each page points its preview card at its own url and image', () => {
  const index = read('index.html'), activity = read('activity.html');
  assert.match(index, /og:url" content="https:\/\/itsmaxsbirthday\.com\/"/);
  assert.match(index, /og:image" content="[^"]*\/assets\/og\.png"/);
  assert.match(activity, /og:url" content="https:\/\/itsmaxsbirthday\.com\/activity"/);
  assert.match(activity, /og:image" content="[^"]*\/assets\/og-activity\.png"/);
  // relative URLs are what break when a scraper resolves them itself
  for (const page of [index, activity]) {
    for (const m of page.matchAll(/(?:og:image|twitter:image|og:url)" content="([^"]+)"/g)) {
      assert.ok(m[1].startsWith('https://'), `preview url must be absolute: ${m[1]}`);
    }
  }
});

test('both pages load the same stylesheet and script', () => {
  for (const page of ['index.html', 'activity.html']) {
    assert.match(read(page), /<link rel="stylesheet" href="\/styles\.css">/);
    assert.match(read(page), /<script src="\/app\.js"><\/script>/);
  }
});

// /activity/ is a URL our own rewrite allows, and a relative path there
// resolves under /activity/ instead of the root — which silently breaks the
// stylesheet, the script and every API call on that page.
test('no page uses a relative path for an asset or an api call', () => {
  for (const page of ['index.html', 'activity.html', 'admin.html']) {
    const html = read(page);
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const v = m[1];
      if (/^(https?:|data:|#|\/)/.test(v)) continue;
      assert.fail(`${page}: relative reference "${v}" breaks at /activity/`);
    }
    for (const m of html.matchAll(/fetch\(\s*['"`]([^'"`]+)/g)) {
      assert.ok(m[1].startsWith('/'), `${page}: relative fetch "${m[1]}"`);
    }
  }
});
