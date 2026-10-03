# Handoff — IA Nexus school navigation

## What project this is

**IA Nexus — school navigation & chatbot**, the navigation assistant for
Independence Academy.

| | |
|---|---|
| Repository | `jackiedv2011/ia-nexus-school-navigation` |
| Local clone | `~/ia-nexus-school-navigation` |
| Working branch | `claude/ia-nexus-nav-audit-5u28mm` |
| Live site deploys from | `main` |
| Frontend dev server | `http://localhost:5183` (Vite, port pinned — no fallback) |
| Backend dev server | `http://localhost:3001` |

This document covers **only** this repository. It is not shared with any
other codebase. (`jackiedv2011/IA-NEXUS` is an older, separate repo — not this
one.) Every path below is relative to the repository root.

---

## Where things stand

| Feature | State |
|---|---|
| **Route Finder** (`/route`) — Pick rooms and Drop a pin | Draws routes on the school's scanned floor plans (`frontend/public/maps/`). This is the original 2D map. |
| **3D Model** (`/model`) | A three.js model of each floor, built from the routing data. Lives on this page only. |
| **Home-screen icon** | Phoenix `apple-touch-icon` + web manifest. Already on `main` and deployed. |

A 3D route map was built and then **taken back out** of the Route Finder at the
owner's request. The Route Finder's map code (`NavigationMap.jsx`,
`PinPicker.jsx`, `floorMaps.js`) is exactly as it was before that work.

### The 3D model

`/model` shows each floor as a plain building plan: walls, doors, windows,
floors and stairs. No furniture, lockers or signs — they were tried and taken
out because they hid the rooms. Room walls follow outlines traced off the
school's scanned plans wherever the trace agrees with the router's doorways
and corridors; elsewhere they fall back to boxes inferred from the doorways.

---

## Next up — the owner's two open requests

These come first. Both are about how things **look**; neither may change a
route. Re-run the checks under "How to verify it" after each.

### 1. Route Finder map: bigger, and sharp enough to read

**What the owner said:** the map's quality is terrible — the room numbers and
labels are too blurry to read. Make the map a little bigger and fix the
blurriness. Applies to both modes: **Pick rooms** (the route map,
`NavigationMap.jsx`) and **Drop a pin** (`PinPicker.jsx`).

**Why it is blurry — this is the image, not the CSS.** The maps are the PNGs in
`frontend/public/maps/`:

| File | Size |
|---|---|
| `floor1.png` | 1222 × 681 |
| `floor2.png` | 873 × 653 |
| `floor3.png` | 982 × 762 |

The room numbers are printed *into* those images at roughly 8 px tall. The
Route Finder shows them about 740 px wide (the page's content column is
`max-width: 860px` in `RoutePage.module.css`), so floor 1 is scaled down to
~60% and its labels end up ~5 px. On a phone (393 px wide at 3× density) the
browser needs ~1,180 device pixels across, so floor 2 is being *enlarged* from
873 — soft at any size. No CSS setting can sharpen text that isn't in the
pixels.

**How to fix it — do both:**

1. **Higher-resolution plan images.** The plans were exported from a PDF of the
   school's blueprints (it was on the owner's Mac as
   `~/Downloads/BluePrint edited.pdf`, previously rendered with
   `pdftoppm -r 150`). Re-export each floor at ~3× the current width (e.g.
   `pdftoppm -r 450 -png`), crop to the same framing, and replace the three PNGs.
   Keep files reasonable (compress with `oxipng`/`pngquant`; aim < 1 MB each).
   **Then update `FLOOR_MAPS` in `frontend/src/lib/floorMaps.js`:** `w`, `h`,
   and the transform. If the new image is exactly k× the old with the same crop,
   multiply `scale`, `dx` and `dy` by k. If the crop changed, re-register (the
   comment at the top of `floorMaps.js` explains how the six numbers were
   found). A wrong transform draws routes and pins in the wrong place —
   `frontend/src/lib/floorMaps.test.js` and `frontend/e2e/pin-mode.spec.js`
   check the coordinate chain, and the route overlay should still land on the
   corridors when you look at it.
2. **Draw the labels as real text, not image pixels.** Overlay each room's
   number in HTML (or on the existing route canvas, which already scales by
   `devicePixelRatio` — see `NavigationMap.jsx` around line 121), positioned
   from blueprint coordinates through `blueprintToImage()`. Room positions are
   available from `frontend/src/lib/floorPlans.json` (`ROOMS[].rect`), or better
   the traced outlines (`roomRect()` in `floorScene.js`). Size them for a phone:
   at least ~11 px on screen. Text drawn this way is crisp at every size and
   every screen density, which no image ever is.

**Bigger:** let the map use more of the screen than the 860 px reading column.
On desktop it can break out to the page width (an earlier version used
`width: min(1240px, calc(100vw - 48px)); margin-left: 50%;
transform: translateX(-50%)` on the map's root). On phones, run it edge to
edge. Keep the floor's own shape (no letterboxing). Optionally add tap-to-
enlarge or pinch-zoom on the map image — the page itself must not scroll
sideways (check `scrollWidth` vs `clientWidth` at 393 px).

**Done when:** at iPhone 16 size (393 × 852, 3×) and on a desktop, every room
number on all three floors is readable in a screenshot without zooming; routes
and pins still land exactly where they did; all tests pass.

### 2. 3D model: more detailed and realistic — without clutter

**What the owner said:** the images of the 3D model aren't detailed; make sure
it looks realistic.

**The constraint that comes with it:** the owner already rejected a version
with desks, chairs, lockers, posters and signs in every room — "too many desks
and stuff… doesn't look realistic at all". That furniture was removed
(`git show 2c03cef` has the full furnished version for reference, in
`frontend/src/lib/scene/props.js` and the `furnish()` function of
`floorScene.js`). So realism has to come from the **building itself**, not
from filling the rooms.

Directions that fit (pick by looking at screenshots, not by adding everything):

- **Room labels big enough to read** in the top-down view — at whole-floor
  scale they are currently tiny. The plate-sizing approach in commit `f17bd5c`
  (plates cut to their text, sized to fit inside the room, vertical in thin
  rooms) solved this once and can be brought back for `label()` in
  `floorScene.js`.
- **Materials that read as a school:** distinct floors by room type already
  exist (`floorTex()` in `floorScene.js`: vinyl tile, carpet for the library,
  maple for the gym, terrazzo for labs). Make sure each room actually gets the
  right kind (`kindOf()`), and that walls, door frames and window glazing have
  believable colour and contrast.
- **Lighting and depth:** soft contact shadows where walls meet floors
  (`aoStrip()` is already there), sun shadows through windows, and wall height
  that reads in the angled view.
- **Architectural detail, sparingly:** door leaves with swing arcs, window
  frames on outside walls, stair treads and railings (all already modelled in
  `scene/props.js`), baseboards. If any furniture comes back, it is one or two
  signature pieces in rooms where it identifies the room (gym hoops, library
  stacks) — never rows of desks — and only with the owner's go-ahead.

**Must not change:** room positions and sizes (they now follow the blueprints —
see the table below), corridors, doorways, stairs. Walls must never block a
route (`walkEdges.json` exists for exactly this).

**Done when:** the owner looks at angled and top-down screenshots of all three
floors and says it looks like the real building. Screenshot all three floors
in both views before and after, and show them side by side.

---

## The pieces, and which is the source of truth

```
backend/data/roomCoordinates.js      ← SOURCE OF TRUTH. Corridors, doorways,
                                       stair landings, room names, findPath().
        │
        ├─ Route Finder ── frontend/src/lib/floorMaps.js
        │                  maps blueprint coordinates onto the scanned plans
        │
        └─ /model ──────── backend/scripts/floorPlan.js        infers room boxes from doorways
                           backend/scripts/buildFloorPlans.js  bakes them → floorPlans.json
                           frontend/scripts/traceRooms.cjs     traces real outlines off the scans
                                                               → roomOutlines.json
                           backend/scripts/buildWalkEdges.js   every segment a route walks
                                                               → walkEdges.json (walls never block one)
                           frontend/src/lib/floorScene.js      three.js geometry
                           frontend/src/lib/scene/             textures, doors/windows, units
                           frontend/src/components/FloorModel3D.jsx
```

All three JSON files are generated — don't hand-edit them:

```bash
node backend/scripts/buildFloorPlans.js                       # floorPlans.json
node backend/scripts/buildWalkEdges.js                        # walkEdges.json
cd frontend && npm run dev   # then, in another tab:
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/traceRooms.cjs   # roomOutlines.json
```

A traced outline is only used if every doorway of the room sits on it, the
router's approach comes square through that wall, and it covers no corridor a
route uses (`roomRect()` in floorScene.js). How closely the model's walls now
follow the scans:

| | Walls on a drawn line | Rooms inside one real room | Rooms on traced walls |
|---|---|---|---|
| Floor 1 | 85% | 17 / 21 | 11 / 21 |
| Floor 2 | 88% | 27 / 29 | 21 / 29 |
| Floor 3 | 96% | 28 / 28 | 27 / 28 |

---

## How to run it

Two terminal tabs. They each block.

**Tab 1 — backend:**
```bash
cd ~/ia-nexus-school-navigation/backend
npm start            # or: npm run dev  (restarts on file changes)
```

**Tab 2 — frontend:**
```bash
cd ~/ia-nexus-school-navigation/frontend
npm run dev
```

Then open **http://localhost:5183**. If it says `Port 5183 is already in use`:
`lsof -ti:5183 | xargs kill`, then `npm run dev` again.

---

## How to verify it

```bash
cd backend  && npm test                    # 108/108
cd frontend && npm test -- --run           # 120/120
cd frontend && npx playwright test         # 57/57
```

The e2e suite starts its own stubbed backend on port 3001. If your real backend
is running, Playwright reuses it and the admin tests fail — stop it first.

All 6,006 routes (1,988 same-floor + 4,018 cross-floor) were audited after the
Route Finder was restored: right doors, right stairwell, every segment on a
mapped hallway, every route the shortest — 0 problems.

---

## Known gaps — the model vs. the school's plans

Checked against `frontend/public/maps/floor{1,2,3}.png`: every room is present
and in the right place, corridors follow the drawn corridors, and 92 of 98
doorways sit on a drawn wall. Three things in `roomCoordinates.js` disagree
with the plans and are recorded in `KNOWN-ISSUES.md`, all `NEEDS-HUMAN-REVIEW`:

- **KI-17** — the Xchange/Library is modelled far smaller than the plans draw it
- **KI-18** — stairwells 9 and 10 have landings inside that library, where the plans show no stairs (338 cross-floor routes use them)
- **KI-19** — Hangar West / Hangar East are labels on the plans, not rooms

These affect routing on the live site too. They were left alone: each fix
changes the graph all 6,006 routes are computed on, and the right answer has to
come from the school's plans.

---

## Left undone

1. **The three blueprint mismatches** (KI-17 – KI-19) need someone with the plans.
2. **Floor 1 has the most rooms still on inferred walls** (GYM, Courtyard,
   Reception, 147, 188, 191, 192, 123). Their traces either failed or disagree
   with the router's doorway — worth a look against the plans.
3. **The full route audits are not in the repo.** They ran from a temporary
   folder. `backend/test/audit.test.js` covers part of the same ground.
4. **`/model` has no automated test.**
5. **The phone preview Artifact is out of date.** It shows the 3D Route
   Finder, which has since been removed.

(The two owner requests at the top of this file come before all of these.)
