# FK Life OS

A single-file personal life-management app — tasks, notes, goals, weekly review
with charts, and prayer times. No build step, no npm, no framework: everything
(HTML, CSS, JavaScript) lives inline in one file.

**Live app:** https://fatimamansoorkhan745-png.github.io/FK-Life-OS/

## Files

| File | What it is |
| --- | --- |
| `index.html` | The app. This is the file GitHub Pages serves as the front page. **Edit this one.** |
| `lifeos.html` | An identical spare copy of the original, kept for reference. |
| `.nojekyll` | Tells GitHub Pages to serve the files as-is. |

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

## Changing the app

Edit `index.html` directly and push to `main`; GitHub Pages redeploys within a
minute or so. Then hard-refresh (Ctrl+Shift+R on a laptop, or a long press on
the reload button on mobile) so you are not looking at the cached old version.

House rules for changes:

- No build step, bundler, npm packages or framework — it stays one file you can
  open by double-clicking.
- Vanilla JavaScript, plain DOM, no TypeScript. Match the style already there.
- Every change must work on phone, tablet and laptop, in portrait and landscape,
  from the start.
- Touch screens never fire HTML5 drag-and-drop events, so anything doable by
  dragging needs a second way to do it from a menu.
