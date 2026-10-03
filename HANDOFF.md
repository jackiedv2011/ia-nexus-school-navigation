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

### Waiting on: local work that was never pushed

The owner's local folder has `/model` changes that are **not in any branch** —
desks and furniture in the rooms, and a "video mode" in the Route Finder. They
can't be reviewed or cleaned up until they are pushed:

```bash
cd ~/ia-nexus-school-navigation
git checkout -b local-model-work
git add -A
git commit -m "Local /model work: furniture and video mode"
git push -u origin local-model-work
```

Requested once that lands: remove the furniture from all three floors, remove
video mode from the Route Finder, and check the model's room sizes, hallways
and floors against the blueprints.

---

## The pieces, and which is the source of truth

```
backend/data/roomCoordinates.js      ← SOURCE OF TRUTH. Corridors, doorways,
                                       stair landings, room names, findPath().
        │
        ├─ Route Finder ── frontend/src/lib/floorMaps.js
        │                  maps blueprint coordinates onto the scanned plans
        │
        └─ /model ──────── backend/scripts/floorPlan.js        infers room outlines
                           backend/scripts/buildFloorPlans.js  bakes them
                           frontend/src/lib/floorPlans.json    ← generated, do not hand-edit
                           frontend/src/lib/floorScene.js      three.js geometry
                           frontend/src/components/FloorModel3D.jsx
```

Regenerate `floorPlans.json` with `node backend/scripts/buildFloorPlans.js`. It
refuses to write if any floor has geometry problems.

**Room outlines in the 3D model are inferred, not recorded.** The source data
holds doorway *points* only; a room is drawn as the band between the corridor
its door opens onto and the next corridor back. Positions and adjacency are
right, exact wall lines are approximate.

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

1. **Push the local `/model` work** (see "Waiting on" above).
2. **The three blueprint mismatches** (KI-17 – KI-19) need someone with the plans.
3. **The full route audits are not in the repo.** They ran from a temporary
   folder. `backend/test/audit.test.js` covers part of the same ground.
4. **`/model` has no automated test.**
5. **The phone preview Artifact is out of date.** It shows the 3D Route
   Finder, which has since been removed.
