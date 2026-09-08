'use strict';
// Regenerates the 3D floor-plan data the frontend model reads.
//
//   node backend/scripts/buildFloorPlans.js
//
// Run this whenever roomCoordinates.js changes — the model is derived from the
// router's corridors, doorways and stair landings, and this is what keeps the
// two from drifting apart. It refuses to write if a floor comes out malformed.

const fs = require('fs');
const path = require('path');
const { buildFloor, stairDepthLimit } = require('./floorPlan');

const OUT = path.join(__dirname, '../../frontend/src/lib/floorPlans.json');
const FLOORS = [1, 2, 3];
const STAIR_W = 118;

// One stairwell size for the whole building: the deepest that still fits
// between corridors on every floor.
const limit = Math.min(185, ...FLOORS.map(f => stairDepthLimit(f, STAIR_W)));
const STAIR_D = Math.max(105, Math.round(limit));

const out = {};
let bad = 0;

for (const f of FLOORS) {
  const p = buildFloor(f, STAIR_W, STAIR_D);
  console.log(`floor ${f}: ${p.ROOMS.length} rooms, ${p.STAIRS.length} stairwells, `
    + `${p.DOORS.length} doorways, ${p.HALLS.length} corridors`);
  if (p.problems.length) {
    bad++;
    console.error('  PROBLEMS:\n    ' + p.problems.join('\n    '));
  }
  // the viewer needs none of the bookkeeping the builder used
  out[f] = {
    bbox: p.bbox,
    HALLS: p.HALLS,
    DOORS: p.DOORS,
    STAIRS: p.STAIRS.map(s => ({ name:s.name, landing:s.landing, foot:s.foot, rect:s.rect, side:s.side })),
    ROOMS: p.ROOMS.map(r => ({ name:r.name, rect:r.rect, doors:r.doors })),
  };
}

if (bad) {
  console.error(`\n${bad} floor(s) have geometry problems — not writing ${path.basename(OUT)}.`);
  process.exit(1);
}

fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\nstairwells ${STAIR_W}x${STAIR_D}px · wrote ${path.relative(process.cwd(), OUT)} `
  + `(${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
