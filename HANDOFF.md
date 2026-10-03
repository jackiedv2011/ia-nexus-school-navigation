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
