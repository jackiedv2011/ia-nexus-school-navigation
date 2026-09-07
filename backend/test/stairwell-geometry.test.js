'use strict';

// Is each stairwell landing attributed to the RIGHT stairwell?
//
// This is the failure mode that no other test in this suite can see. A landing
// filed under the wrong stair id produces a route that is well-formed, that is
// the shortest available given the data, and that draws cleanly on the map —
// and that walks a student to a staircase which does not come out where the
// map says. Every other test passes. Only the geometry gives it away.
//
// The tell is that a real stairwell is a vertical shaft: its landings sit at
// essentially the same place on every floor. One thing obscures that here:
// floor 1 was traced from a sheet at a different origin, so its whole
// coordinate space is shifted ~27m from floors 2 and 3 (see the FLOOR 1'S
// COORDINATE OFFSET comment in roomCoordinates.js). Raw floor-1 -> floor-2
// distances are therefore 21-36m for every stairwell, including the ones
// confirmed against the school's own marks.
//
// So the floor-1/floor-2 check is on the RESIDUAL: take out the shift every
// stairwell shares, and what remains should be no more than a stairwell
// footprint plus hand-drawing wobble. That is what distinguishes "the whole
// sheet is offset" from "this one landing belongs to a different staircase".
//
// Floors 2 and 3 share a coordinate origin, so no such shift applies there —
// this file's stairwells (including 9's Xchange/Library neighbour, 10) all
// move only 1-3m between those two floors. That used to be a genuine
// exception: a single id "9" was recorded with landings 16m apart on floors
// 2 and 3, which this test flagged and which turned out to be two separate
// stairwells (see KI-15 in KNOWN-ISSUES.md) — split, the outlier is gone.

const test = require('node:test');
const assert = require('node:assert');
const { STAIR_POSITIONS } = require('../data/roomCoordinates');

const M_PER_PX = 140 / 2448;
const px2m = (px) => px * M_PER_PX;

function shiftsBetween(floorA, floorB) {
  const out = [];
  for (const [id, landings] of Object.entries(STAIR_POSITIONS)) {
    if (!landings[floorA] || !landings[floorB]) continue;
    out.push({
      id,
      dx: landings[floorB][0] - landings[floorA][0],
      dy: landings[floorB][1] - landings[floorA][1],
    });
  }
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// A stairwell footprint is a few metres; the hand-drawn marks wobble by a few
// more. Measured worst case across the eight confirmed stairwells is 10m.
// 15m leaves headroom for another honest mark without admitting a landing
// that belongs to a different staircase (the nearest wrong candidate in this
// building is 30m+ away).
const MAX_RESIDUAL_M = 15;

test('every floor-1 landing sits where its floor-2 landing predicts, once the sheet offset is removed', () => {
  const shifts = shiftsBetween(1, 2);
  assert.ok(shifts.length >= 5, 'expected most stairwells to span floors 1 and 2');

  const mx = mean(shifts.map((s) => s.dx));
  const my = mean(shifts.map((s) => s.dy));

  for (const s of shifts) {
    const residual = Math.hypot(s.dx - mx, s.dy - my);
    assert.ok(px2m(residual) <= MAX_RESIDUAL_M,
      `stair ${s.id}: floor-1 landing is ${Math.round(px2m(residual))}m from where its floor-2 `
      + `landing predicts (allowing for the ${Math.round(px2m(Math.hypot(mx, my)))}m sheet offset). `
      + `That is far enough to suggest this landing belongs to a different stairwell.`);
  }
});

// Floors 2 and 3 share an origin, so there is no sheet offset to subtract and
// the landings should sit almost exactly on top of each other. No exception
// list here on purpose: the one stairwell that used to need one (id "9",
// with landings 16m apart) turned out to be two stairwells wrongly sharing
// an id, not a genuinely large shift — see KI-15 in KNOWN-ISSUES.md. A
// future id that needs an exception is more likely the same mistake again
// than a new architectural fact, so this stays a flat limit rather than
// growing a list.
test('floor-2 and floor-3 landings of the same stairwell are nearly coincident', () => {
  const MAX_M = 6;
  const pairs = shiftsBetween(2, 3);
  assert.ok(pairs.length >= 7, 'expected nearly every stairwell to span floors 2 and 3');

  for (const s of pairs) {
    const moved = px2m(Math.hypot(s.dx, s.dy));
    assert.ok(moved <= MAX_M,
      `stair ${s.id}: moves ${Math.round(moved)}m between floors 2 and 3 (limit ${MAX_M}m). `
      + `Floors 2 and 3 share a coordinate origin, so a real shaft should barely move — this is `
      + `the same shape of bug KI-15 fixed: a landing filed under the wrong stairwell id.`);
  }
});

// Two stairwells sharing a landing would mean one of them is mis-attributed.
test('no two stairwells claim the same landing', () => {
  for (const floor of [1, 2, 3]) {
    const seen = new Map();
    for (const [id, landings] of Object.entries(STAIR_POSITIONS)) {
      if (!landings[floor]) continue;
      const k = `${landings[floor][0]},${landings[floor][1]}`;
      assert.ok(!seen.has(k),
        `floor ${floor}: stairs ${seen.get(k)} and ${id} both land at ${k}`);
      seen.set(k, id);
    }
  }
});
