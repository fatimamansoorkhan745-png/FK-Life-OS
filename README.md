# FK Life OS

A single-file personal life-management app — tasks, notes, goals, weekly review
with charts, and prayer times. No build step, no npm, no framework: everything
(HTML, CSS, JavaScript) lives inline in one file.

**Live app:** https://fk-lifeos.pages.dev/ — hosted on Cloudflare Pages, behind
a password.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The app. This is the file GitHub Pages serves as the front page. **Edit this one.** |
| `lifeos.html` | An identical spare copy of the original, kept for reference. |
| `petal/` | **Petal Planner**, a separate personal planner with its own website (see below). |
| `functions/_middleware.js` | The password gate. Cloudflare runs this in front of every request. |
| `.nojekyll` | Only matters if the site is ever served from GitHub Pages instead. |

The Cloudflare Pages project is called `fk-lifeos`. It is a Direct Upload
project, so it is not wired to this repository: pushing here does not deploy.
A change goes live by uploading `index.html` and `functions/` again with
Wrangler, using a Cloudflare API token that has Account -> Cloudflare Pages ->
Edit permission.

## Petal Planner

`petal/` is a second, separate app: a weekly routine, food plan, journal, study
notes, lists and Google Calendar, which used to be called Fatima's Bloom. The
same `petal/index.html` runs in two places:

- **Inside claude.ai**, as a private artifact
  (https://claude.ai/artifact/G4VHsTSR2gLYaEL6sMZfmk). There, data stays in
  that browser, and the calendar comes from the claude.ai Google Calendar
  connector.
- **As its own website** on Cloudflare Pages, behind a password. There,
  everything syncs between phone, tablet and laptop, and Google Calendar is
  connected directly (events show in the Calendar tab and in each Weekly Routine
  day, and anything added from the planner goes straight into Google Calendar).
  The page notices the site by the `X-Petal-Planner` header the site puts on
  every reply, and only switches sync on there.

| File | What it is |
| --- | --- |
| `petal/index.html` | The app. |
| `petal/functions/_middleware.js` | Sign-in page and password check for the whole site. |
| `petal/functions/api/data.js` | Sync: the shared copy of the planner data. |
| `petal/functions/api/calendar/[[path]].js` | Google Calendar connection. |
| `petal/functions/_shared/db.js` | Database helpers. Tables are created automatically. |
| `petal/sw.js` | Lets the app open with no signal. |
| `petal/manifest.webmanifest`, `petal/icon*` | Home-screen name and icon. |

Step-by-step setup is in [`petal/SETUP.md`](petal/SETUP.md).

How sync works: every device keeps working from its own copy and sends changes
about a second after they are made. It checks for other devices' changes every
15 seconds, and whenever the app is brought back on screen. If two devices
changed things in between, the changes are merged against the last shared copy
item by item, so both are kept. Only when both changed the very same box does
the newer one win. Data is stored in Cloudflare D1, in the user's own
Cloudflare account.

Settings on the Pages project:

| Setting | Meaning |
| --- | --- |
| D1 binding `DB` | The database. Required. |
| `PETAL_PASSWORD` (secret) | The password. Required: without it the site stays locked. Changing it signs every device out. |
| `GOOGLE_CLIENT_ID` | From Google Cloud. Optional: only for Google Calendar. |
| `GOOGLE_CLIENT_SECRET` (secret) | From Google Cloud. Optional: only for Google Calendar. |

To test locally: run `npx wrangler pages dev . --d1 DB=petal --binding PETAL_PASSWORD=test`
from inside `petal/`. `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL` and
`GOOGLE_API_URL` can point the calendar at a stand-in server.

## Where my data lives

All tasks, notes, goals and reviews are stored in **your browser's own storage**
on the device you typed them on. Nothing personal is in this repository, and
nothing is uploaded anywhere.

Two things follow from that:

- **Data does not travel between devices on its own.** To move it: on the first
  device open ⚙ Settings → *Export backup*, then on the second device open
  ⚙ Settings → *Import backup*.
- **Clearing browser data for this site erases the app's contents.** Export a
  backup now and then.

## What leaves the device

- Prayer times are fetched from `ummahapi.com`.
- If you allow location access, your coordinates are turned into a place name by
  `api.bigdatacloud.net`.

Nothing else.

## The password

The password is not stored in this repository. It lives in two environment
variables set in the Cloudflare dashboard, under
**Settings -> Variables and Secrets**:

| Variable | Meaning |
| --- | --- |
| `LIFEOS_USER` | Username to type. Optional; defaults to `fk`. |
| `LIFEOS_PASSWORD` | Password to type. **The gate is off until this is set.** |

To change the password, edit `LIFEOS_PASSWORD` in Cloudflare and redeploy. No
code change is needed.

Note what the password does and does not do. It stops other people opening the
site. It does **not** encrypt anything, and it does **not** hide the app from
someone holding your unlocked phone, because the data is already in that
browser.

## Changing the app

Edit `index.html` directly, push to `main` so the repository stays the source of
truth, then redeploy to Cloudflare (see above). Then hard-refresh (Ctrl+Shift+R on a laptop, or a long press on
the reload button on mobile) so you are not looking at the cached old version.

House rules for changes:

- No build step, bundler, npm packages or framework — it stays one file you can
  open by double-clicking.
- Vanilla JavaScript, plain DOM, no TypeScript. Match the style already there.
- Every change must work on phone, tablet and laptop, in portrait and landscape,
  from the start.
- Touch screens never fire HTML5 drag-and-drop events, so anything doable by
  dragging needs a second way to do it from a menu.
