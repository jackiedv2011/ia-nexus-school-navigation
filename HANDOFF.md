# Handoff — 3D floor maps in the Route Finder

## What project this is

**IA Nexus — school navigation & chatbot**, the navigation assistant for
Independence Academy.

| | |
|---|---|
| Repository | `jackiedv2011/ia-nexus-school-navigation` |
| Local clone | `~/ia-nexus-school-navigation` |
| Branch this work is on | `claude/ia-nexus-nav-audit-5u28mm` |
| Frontend dev server | `http://localhost:5183` (Vite, port pinned — no fallback) |
| Backend dev server | `http://localhost:3001` |

This document covers **only** this repository. It is not a general-purpose
mapping project, not a library, and not shared with any other codebase. Every
path below is relative to the repository root.

---

## What changed

The Route Finder used to draw a route as a red line on a scanned PNG of the
school's floor plan. It now draws that route on a **3D model of the floor**,
built from the same data the router walks. The scanned plans are still in the
repo (`frontend/public/maps/`) but nothing renders routes on them any more.

Seven commits, oldest first:

| Commit | What it did |
|---|---|
| `078a716` | Replaced the blueprint image + 2D canvas overlay with the 3D model as the route map |
| `4b0d5ac` | Route maps open as a top view; the pin picker moved onto the model too |
| `b190e85` | Gave the pin picker the same scene, camera and controls as the route map |
| `0283da2` | Dropped zoom, fixed the whole floor in frame, made room names readable |
| `93f7a54` | Stopped the Start/Destination plate outgrowing the rooms around it |
| `f17bd5c` | Sized every name plate to the room it names |
| `94bff97` | Made the maps and the Route Finder work on a phone |

---

## The pieces, and which is the source of truth

```
backend/data/roomCoordinates.js      ← SOURCE OF TRUTH. Corridors, doorways,
                                       stair landings, room names, findPath().
                                       Nothing in this work changed it.
        │
        ├─ backend/scripts/floorPlan.js        infers room outlines from it
        ├─ backend/scripts/buildFloorPlans.js  bakes the result
        ▼
frontend/src/lib/floorPlans.json     ← generated. Do not hand-edit.
        │
        ▼
frontend/src/lib/floorScene.js       ← builds three.js geometry from the plans.
                                       Shared by everything below.
        │
        ├─ components/RouteScene3D.jsx   one floor + the walk drawn on it
        ├─ components/PinScene3D.jsx     one floor you can tap to drop a pin
        └─ components/FloorModel3D.jsx   the standalone /model page
```

`frontend/src/lib/floorPlans.json` is **generated**. To regenerate:

```bash
node backend/scripts/buildFloorPlans.js
```

It refuses to write and exits non-zero if any floor has geometry problems, so
the model cannot silently drift from the router.

### Things worth knowing before you change floorScene.js

- **Room outlines are inferred, not recorded.** The source data holds doorway
  *points* only. A room is derived as the band between the corridor its door
  opens onto and the next corridor back. Positions and adjacency are right;
  exact wall lines are approximate. See "Known gaps" below.
- **The maps do not zoom, by design.** The frame always holds the whole floor,
  recomputed on every resize from the floor's bounds and the element's real
  aspect ratio. Drag (or arrow keys, on the route map) turns the building.
- **Each map's frame is cut to its floor's shape** (`floorAspect()`), so the
  building fills it rather than sitting in a letterbox. This is most of the
  legibility on a phone.
- **A tap on the pin picker is raycast onto the floor plane**, not measured off
  a fixed picture, so it stays exact however the building has been turned. A
  press that moves more than 4px is a drag, not a tap.
- **Name plates are drawn on a canvas cut to their own text**, then scaled to
  the largest size the room can hold. A long thin room gets its name running
  along it. `Start`/`Destination` have no room, so they score the eight
  directions around the marker and go where they cover least.
- **The canvas is `position: absolute` inside its frame.** It has to be: in
  flow it feeds its own height back into the box whose aspect ratio just sized
  it, which is what made the pin frame come out 300px when it asked for 186.

---

## How to run it

Two terminal tabs. They each block.

**Tab 1 — backend:**
```bash
cd ~/ia-nexus-school-navigation/backend
npm start
```
Wait for `✅ IA Nexus backend running at http://localhost:3001`.

> `npm run dev` in `backend/` is broken — it calls `nodemon`, which is not a
> dependency. Use `npm start`. (Unfixed; see "Left undone".)

**Tab 2 — frontend:**
```bash
cd ~/ia-nexus-school-navigation/frontend
npm run dev
```
Wait for `➜  Local: http://localhost:5183/`.

If it says `Port 5183 is already in use`, a server from a previous session is
still running. `vite.config.js` pins the port deliberately rather than guessing
a different one:

```bash
lsof -ti:5183 | xargs kill      # add -9 if it survives
npm run dev
```

Then open **http://localhost:5183/route**.

---

## How to verify it

All of these passed at `94bff97`.

```bash
cd backend  && npm test                    # 108/108
cd frontend && npm test -- --run           # 122/122
cd frontend && npx playwright test         # 58/58
```

**Note on the e2e suite:** it starts its own stubbed backend on port 3001. If
your real dev backend is running, Playwright reuses it instead and the three
admin tests fail on the wrong `ADMIN_KEY`. Kill port 3001 first. If Playwright
reports a missing browser, the pre-installed one is at
`/opt/pw-browsers/chromium` — pass it as `PW_CHROMIUM=/opt/pw-browsers/chromium`.

### Route correctness

The router itself was not touched, but three audits over **all 6,006 routes**
(1,988 same-floor + 4,018 cross-floor) were run after every change. They live
in the session scratchpad rather than the repo — see "Left undone".

| Check | Result at `94bff97` |
|---|---|
| Right start door, right end door, axis-aligned, shortest path | 6006/6006, 0 problems |
| Cross-floor uses a real staircase, both legs meet at it | 4018/4018 |
| Path segments on mapped hallways | 79,582 segments, 0 unexplained |
| Every route drawable on the model (no waypoint off the floor) | 6006/6006 |

---

## Known gaps — the model vs. the school's plans

The 3D model was checked against the school's own drawings in
`frontend/public/maps/floor{1,2,3}.png`, using the registration transform in
`frontend/src/lib/floorMaps.js`.

**It matches structurally.** Every room is present, in the right place and the
right order on all three floors. Corridors run down the drawings' corridors.
**92 of 98 doorways** land on a line the drawing actually draws.

**It does not match perfectly, and some of that cannot be fixed from here.**
About 66% of each room box's perimeter lands on a drawn wall — the consequence
of inferring outlines from doorway points.

Three specific mismatches are now recorded in `KNOWN-ISSUES.md` as **KI-17
through KI-19**, all marked `NEEDS-HUMAN-REVIEW`. In short:

- **KI-17** — the Xchange/Library is modelled far smaller than the plans draw it
- **KI-18** — stairwells 9 and 10 have three landings inside that drawn library, where the plans show no stairs (338 cross-floor routes use them)
- **KI-19** — Hangar West / Hangar East are annotation labels on the plans, not rooms

All three are in `backend/data/roomCoordinates.js` — the data the **deployed**
app already routes on. They predate this work. They were deliberately left
alone: moving a stairwell or a corridor rewrites all 6,006 routes, and whether
stairs 9/10 exist inside the library is a question for the school's plans, not
one to guess at.

The automated check also flagged the GYM's two doorways as ~1 m off the drawn
wall. That is **not** an issue: KI-16 already audited every doorway visually at
2.2x and confirmed both GYM doors sit on its wall. The automated check uses a
7-plan-pixel tolerance and missed by about 8 — measurement noise.

---

## Left undone

Nothing here is blocking. Each is a deliberate stopping point.

1. **The route audits are not in the repo.** `audit-routes.js`, `verify-all.js`,
   `audit-render.js` and `blueprint-check.cjs` ran from the session scratchpad
   and will be lost. They are worth porting into `backend/test/` (the first
   three are plain Node) and `frontend/e2e/` (the blueprint overlay needs a
   browser). Until then, the 6,006-route guarantee is only as good as
   `backend/test/audit.test.js`, which covers less.

2. **`backend`'s `npm run dev` script is broken** — it references `nodemon`,
   which is not in `package.json` at all. Either add it as a devDependency or
   point the script at `node --watch`.

3. **The three blueprint mismatches** (KI-17 – KI-19) need someone with the
   school's plans.

4. **The `/model` page has no automated test.** The Route Finder's maps are
   covered by `frontend/e2e/route-finder.spec.js` and `pin-mode.spec.js`, but
   `/model` is only checked by hand.

5. **Nav links overflow into a scrollable strip on phones.** On `/route` and
   `/model` below 720px the links scroll sideways with no visual affordance
   that they do. It works, but a fade or a chevron would tell you.

---

## The phone preview

A self-contained working preview was published as a Claude Artifact:

**https://claude.ai/artifact/F3wjyoDYSAKxGsXcK6hshd**

It bundles the real `frontend/src/lib/floorScene.js` and the real
`backend/data/roomCoordinates.js`, so the routes and maps it shows are the
app's own, not a mock-up. It needs no server and works offline.

It is a **snapshot**, not a live view of the repo — it does not update when the
code changes. The build inputs are in the session scratchpad and will be lost;
rebuilding it means re-bundling those two files with Vite in IIFE mode and
inlining the result into a single HTML page.

---

## Testing on a phone

The work was checked at iPhone 16 dimensions — 393×852 CSS px, 3× DPR, touch,
mobile Safari's user agent. What that found and fixed is in `94bff97`.

If you re-test on a phone, the things most likely to regress:

- **Sideways scroll.** Compare `document.documentElement.scrollWidth` against
  `clientWidth` on every page. `/model` was 542px wide on a 393px screen before
  this work.
- **Tap targets.** Everything on `/route` is 44pt tall, which is what iOS asks
  for and what none of it was. Easy to lose when adding a control.
- **A drag on a map must turn the building, not scroll the page.** That depends
  on `touch-action: none` on both the frame and the canvas.
