# celebrating max's birthday

**[itsmaxsbirthday.com](https://itsmaxsbirthday.com)**

Single-page invite site. Hero → RSVP modal → "who's coming" guest list, with
photographic cutouts drifting in zero gravity behind it all.

**september 12 / 15 sheridan square / 8pm**

Built from the `design_handoff_max_birthday` spec — plain HTML/CSS/JS with
Vercel functions for the RSVPs. No build step, no framework.

```
index.html          hero + guest list + modal (all three views, toggled in JS)
styles.css          design tokens, layout, the six drift keyframes
app.js              state machine, validation, API calls
fonts/              Orbitron 800 + Space Mono 400/700, self-hosted
assets/             the three cutouts, plus the link-preview card
api/                serverless functions (see below)
test/               API tests — `npm test`
```

## Deploying

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Leave
   Framework Preset on "Other" and Root Directory as `./` — there's nothing to
   build and nothing to point at.
2. **Deploy.** The site will be live, but every RSVP will fail quietly (see
   below) until step 4.
3. **Add storage:** project → **Storage** → **Create Database** → **Blob**, and
   connect it to the project. That sets `BLOB_READ_WRITE_TOKEN` automatically.
4. **Set `ADMIN_KEY`** under Settings → Environment Variables, to any secret
   string you make up.
5. **Redeploy.** Steps 3 and 4 only take effect on a new deployment.

### The domain

6. Project → **Settings** → **Domains** → add `itsmaxsbirthday.com`. Add
   `www.itsmaxsbirthday.com` too; Vercel will redirect one to the other.
7. Point DNS at Vercel with whoever the domain is registered with. **Use the
   exact records Vercel shows you** — an `A` record on the apex and a `CNAME` on
   `www`. Vercel has changed these IPs before, so don't copy them from any
   older guide, this one included. Propagation is typically minutes, but can
   take a few hours.
8. Wait for the domain to show **Valid Configuration** in Vercel, with its
   certificate issued, before sending the link to anyone.

The domain is hardcoded in five places in the `<head>` of `index.html` — the
canonical link, `og:url`, `og:site_name`, and the two preview-image tags. If it
ever changes, `grep itsmaxsbirthday.com index.html` finds all of them.

### Reading the RSVPs

Open `/api/admin?key=YOUR_ADMIN_KEY`. That returns every RSVP with phone numbers,
plus-ones, a headcount, and everyone's excuses. It's the only endpoint that
exposes phone numbers, and the only one behind a key — so keep the key to
yourself, and don't paste that URL anywhere shared.

### Before it goes out

- Send yourself the link first and check the preview card renders — that's the
  bit that can't be tested before the domain is live. If it looks wrong, paste
  the URL into [the Facebook debugger](https://developers.facebook.com/tools/debug/)
  to see what the scraper actually got, and to force a re-scrape after a fix.
  iMessage caches previews hard; test in a fresh thread.
- Do one real RSVP end to end and confirm it shows up at `/api/admin`.
- The FAQ says "text noemie" — no number is published anywhere on the page.
- Anyone with the link can RSVP. There's no login, by design.

## API

| Route | Method | Does |
|---|---|---|
| `/api/guests` | GET | Public guest list. Names, avatars, `+1` flags — nothing else. Cached ~10s; `?fresh=1` bypasses it. |
| `/api/rsvp` | POST | Records an RSVP. |
| `/api/upload` | POST | Stores a guest's own profile photo, returns its URL. |
| `/api/admin` | GET | Every record, with phone numbers and excuses. Needs `ADMIN_KEY`. |

Each RSVP is written as **two** blobs: a public card under `guests/` (name,
avatar, `+1`) and the full record under `rsvps/` (phone number, excuse).
`/api/guests` only ever reads `guests/`, so a phone number is never one request
away from the open web. Declines are written only to `rsvps/` — they never reach
the guest list.

Profile photos are cropped and downscaled to a 256px square in the browser
before upload, so a 4MB camera roll photo arrives as a few KB. The server only
accepts JPEG/PNG/WebP under 600KB, and `/api/rsvp` only accepts an avatar URL on
our own blob host.

### If storage isn't set up

The page still loads and the modal still works — RSVPs fall back to the guest's
own browser via `localStorage`, so nothing breaks in front of them, but **the
RSVP never reaches you.** Don't send the link around until step 4 is done and
you've tested one RSVP end to end.

## Working on it

There's no build. Open `index.html`, or serve the folder:

```sh
npm install          # only needed for the tests and `vercel dev`
npx serve .          # static only — /api/* will 404 and the fallback kicks in
vercel dev           # the real thing, functions included
npm test             # API tests (validation, privacy split, admin auth)
```

## Design notes

Worth knowing before changing anything — each of these was a deliberate call:

- **The headline never wraps.** It scales with the viewport and stays one line
  at every width. Below 375px the design's 19px floor is wider than the screen,
  so there's a media query that scales it down instead of letting it clip.
- **Floaters only live in the top and bottom bands**, never the vertical middle,
  because the nowrap headline spans nearly the full width. Their edge insets
  (5–8%, not 1%) allow for the bounding box of a shape rotating a full 360°.
- **Drift amplitude is small** — max ±3vw, ±2.2vh. It should read as slow
  zero-g, not as things flying across the screen.
- **Fonts are self-hosted.** The page is almost entirely typography; it
  shouldn't depend on Google Fonts being reachable.
- `prefers-reduced-motion` stops the drift and the hero bob.
