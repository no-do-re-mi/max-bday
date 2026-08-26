# celebrating max's birthday

Single-page invite site. Hero → RSVP modal → "who's coming" guest list, with
photographic cutouts drifting in zero gravity behind it all.

**september 12 / 15 sheridan square / 8pm**

Built from `design_handoff_max_birthday` — plain HTML/CSS/JS with Vercel
functions for the RSVPs. No build step, no framework.

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

The site lives in a subdirectory, so Vercel needs to be pointed at it.

1. **Import the repo** at [vercel.com/new](https://vercel.com/new), picking this
   branch.
2. Set **Root Directory** to `max-birthday`. Leave Framework Preset on "Other" —
   there's nothing to build.
3. Deploy. The site will be live, but every RSVP will fail quietly (see below)
   until step 4.
4. **Add storage:** project → **Storage** → **Create Database** → **Blob**, and
   connect it to the project. That sets `BLOB_READ_WRITE_TOKEN` automatically.
5. **Redeploy** so the function picks up the token.

To see the RSVPs, set an `ADMIN_KEY` environment variable to any secret string,
redeploy, and open `/api/admin?key=YOUR_KEY`. That returns every RSVP with phone
numbers, plus-ones, a headcount, and everyone's excuses. It's the only endpoint
that exposes phone numbers, and it's the only one behind a key — keep the key to
yourself.

### Before it goes out

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
