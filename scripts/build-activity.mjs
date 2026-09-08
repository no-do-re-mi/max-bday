// /activity needs its own link-preview card, which means its own <head> — a
// rewrite to / can only ever serve the homepage's tags. Rather than keep a
// second copy of the markup by hand, activity.html is generated from
// index.html with just the page-identity block swapped. `npm test` fails if
// the two drift apart, so editing index.html without regenerating is caught.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const START = '<!-- page-identity:start -->';
const END = '<!-- page-identity:end -->';
const SITE = 'https://itsmaxsbirthday.com';

export const IDENTITY = `${START}
<title>the structured activity — max's birthday</title>
<meta name="description" content="there is a structured activity before the party on september 12. are you free from 5, 6 or 7pm?">
<link rel="canonical" href="${SITE}/activity">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/activity">
<meta property="og:site_name" content="itsmaxsbirthday.com">
<meta property="og:title" content="a structured activity">
<meta property="og:description" content="before max's birthday party. are you free from 5, 6 or 7pm?">
<meta property="og:image" content="${SITE}/assets/og-activity.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="a structured activity — september 12, are you free from 5, 6 or 7pm">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="a structured activity">
<meta name="twitter:description" content="before max's birthday party. are you free from 5, 6 or 7pm?">
<meta name="twitter:image" content="${SITE}/assets/og-activity.png">
${END}`;

export function buildActivityPage(indexHtml) {
  const i = indexHtml.indexOf(START);
  const j = indexHtml.indexOf(END);
  if (i === -1 || j === -1) throw new Error('page-identity markers missing from index.html');
  return indexHtml.slice(0, i) + IDENTITY + indexHtml.slice(j + END.length);
}

// Only write when run directly. Importing this module must have no side
// effects — the sync test imports it, and a write on import would regenerate
// the file it is trying to check, making the test pass no matter what.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const page = buildActivityPage(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  writeFileSync(new URL('../activity.html', import.meta.url), page);
  console.log('activity.html written');
}
