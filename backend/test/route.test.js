'use strict';

// Regression tests that lock in the pathfinding behavior. roomCoordinates.js is a
// protected system — these snapshots prove the algorithm, room coordinates, and
// stair selection produce identical results before and after a change.
//
// The snapshots below were re-captured after the corridor-graph fix (tolerant
// junction snapping + perpendicular door/stair attachment + corridor extents
// corrected to reach the stairwells and the NE wing). The previous baseline
// encoded routes that detoured around junctions the data recorded a few pixels
// short of meeting — most visibly 116 -> 333, which swung west and cut through
// the Media Center instead of dropping straight down the centre corridor.
//
// The exhaustive property test at the bottom is the real guard: point-count
// snapshots are brittle, but "every route starts at its door, ends at its door,
// and only ever travels along a corridor" is the thing that must never regress.

const test = require('node:test');
const assert = require('node:assert');
const { findPath, ROOM_DOORS, CORRIDORS, STAIR_POSITIONS } = require('../data/roomCoordinates');

const CASES = [
  { in: ['188', 1, '331', 3], sameFloor: false, stairNum: 2, fromFloor: 1, toFloor: 3, path1Len: 16, path2Len: 9,  path1First: [277, 421],  path1Last: [1385, 1045] },
  { in: ['253', 2, '351', 3], sameFloor: false, stairNum: 5, fromFloor: 2, toFloor: 3, path1Len: 5,  path2Len: 5,  path1First: [1796, 1320], path1Last: [1670, 1505] },
  { in: ['331', 3, '359', 3], sameFloor: true,  stairNum: null, fromFloor: 3, toFloor: 3, path1Len: 12, path2Len: 0, path1First: [1443, 993], path1Last: [1816, 1310] },
  { in: ['101', 1, '102', 1], sameFloor: true,  stairNum: null, fromFloor: 1, toFloor: 1, path1Len: 2,  path2Len: 0, path1First: [1200, 816], path1Last: [1255, 816] },
  { in: ['281', 2, '294', 2], sameFloor: true,  stairNum: null, fromFloor: 2, toFloor: 2, path1Len: 23, path2Len: 0, path1First: [470, 255],  path1Last: [2082, 265] },
  { in: ['189', 1, '192', 1], sameFloor: true,  stairNum: null, fromFloor: 1, toFloor: 1, path1Len: 18, path2Len: 0, path1First: [285, 715],  path1Last: [2151, 265] },
  { in: ['341', 3, '351', 3], sameFloor: true,  stairNum: null, fromFloor: 3, toFloor: 3, path1Len: 18, path2Len: 0, path1First: [605, 950],  path1Last: [1816, 1045] },
];

for (const c of CASES) {
  const [fr, ff, tr, tf] = c.in;
  test(`route ${fr}(F${ff}) -> ${tr}(F${tf}) is unchanged`, () => {
    const r = findPath(fr, ff, tr, tf);
    assert.strictEqual(r.sameFloor, c.sameFloor, 'sameFloor');
    assert.strictEqual(r.stairNum, c.stairNum, 'stairNum');
    assert.strictEqual(r.fromFloor, c.fromFloor, 'fromFloor');
    assert.strictEqual(r.toFloor, c.toFloor, 'toFloor');
    assert.strictEqual((r.path1 || []).length, c.path1Len, 'path1 length');
    assert.strictEqual((r.path2 || []).length, c.path2Len, 'path2 length');
    assert.deepStrictEqual((r.path1 || [])[0], c.path1First, 'path1 first point');
    assert.deepStrictEqual((r.path1 || []).slice(-1)[0], c.path1Last, 'path1 last point');
  });
}

// Determinism: calling twice yields identical paths.
test('findPath is deterministic', () => {
  const a = findPath('188', 1, '331', 3);
  const b = findPath('188', 1, '331', 3);
  assert.deepStrictEqual(a, b);
});

// The specific route that exposed the junction bug: the centre corridor on
// floor 3 (x=1219) was recorded 6px shy of the top corridor, so this route
// detoured ~230px west and drew a line straight through the Media Center.
test('116 -> 333 descends the centre corridor, not through the Media Center', () => {
  const r = findPath('116', 1, '333', 3);
  const xs = r.path2.map(p => p[0]);
  assert.ok(!xs.includes(989), 'must not detour to the x=989 corridor through the Media Center');
  assert.ok(xs.includes(1219), 'should use the centre corridor at x=1219');
});

// ── Exhaustive geometry check over every room pair on every floor ────────────

const STUB_MAX = 70;         // stepping out of a doorway into the hall
const STAIR_STUB_MAX = 250;  // stairwells sit off the corridor grid by design
const ON_CORR = 34;          // tolerance around a corridor centre-line

const roomsByFloor = { 1: [], 2: [], 3: [] };
for (const k of Object.keys(ROOM_DOORS)) {
  const [f, r] = k.split(':');
  roomsByFloor[+f].push(r);
}

const STAIR_PTS = new Set();
for (const fl of Object.values(STAIR_POSITIONS)) {
  for (const f of [1, 2, 3]) if (fl[f]) STAIR_PTS.add(`${f}:${fl[f]}`);
}

function segOnCorridor(floor, [x1, y1], [x2, y2]) {
  const corrs = CORRIDORS[floor];
  if (y1 === y2) {
    return corrs.horizontal.some(hc =>
      Math.abs(hc.y - y1) <= ON_CORR &&
      Math.min(x1, x2) >= hc.xMin - ON_CORR &&
      Math.max(x1, x2) <= hc.xMax + ON_CORR);
  }
  if (x1 === x2) {
    return corrs.vertical.some(vc =>
      Math.abs(vc.x - x1) <= ON_CORR &&
      Math.min(y1, y2) >= vc.yMin - ON_CORR &&
      Math.max(y1, y2) <= vc.yMax + ON_CORR);
  }
  return false; // diagonal
}

function legProblems(floor, pts, expectStart, expectEnd, label) {
  const out = [];
  if (!pts || !pts.length) return [`${label}: empty path`];

  const s = pts[0], e = pts[pts.length - 1];
  if (s[0] !== expectStart[0] || s[1] !== expectStart[1]) out.push(`${label}: starts ${s} not ${expectStart}`);
  if (e[0] !== expectEnd[0] || e[1] !== expectEnd[1]) out.push(`${label}: ends ${e} not ${expectEnd}`);

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    if (a[0] !== b[0] && a[1] !== b[1]) { out.push(`${label}: diagonal ${a}->${b}`); continue; }
    if (segOnCorridor(floor, a, b)) continue;
    const isEndStub = i === 0 || i === pts.length - 2;
    const touchesStair = STAIR_PTS.has(`${floor}:${a}`) || STAIR_PTS.has(`${floor}:${b}`);
    if (isEndStub && touchesStair && len <= STAIR_STUB_MAX) continue;
    if (isEndStub && len <= STUB_MAX) continue;
    out.push(`${label}: off-corridor ${a}->${b} (${Math.round(len)}px)`);
  }
  return out;
}

test('every room-pair route starts at its door, ends at its door, and stays in the hallways', () => {
  const failures = [];
  let checked = 0;

  for (const ff of [1, 2, 3]) {
    for (const tf of [1, 2, 3]) {
      for (const fr of roomsByFloor[ff]) {
        for (const tr of roomsByFloor[tf]) {
          if (ff === tf && fr === tr) continue;
          checked++;
          const r = findPath(fr, ff, tr, tf);
          const tag = `${fr}(F${ff})->${tr}(F${tf})`;
          if (!r || r.error) { failures.push(`${tag}: ${r && r.error}`); continue; }

          const fromDoor = ROOM_DOORS[`${ff}:${fr}`];
          const toDoor = ROOM_DOORS[`${tf}:${tr}`];

          const probs = r.sameFloor
            ? legProblems(ff, r.path1, fromDoor, toDoor, 'leg')
            : [
                ...legProblems(ff, r.path1, fromDoor, STAIR_POSITIONS[r.stairNum][ff], `leg1(F${ff})`),
                ...legProblems(tf, r.path2, STAIR_POSITIONS[r.stairNum][tf], toDoor, `leg2(F${tf})`),
              ];
          for (const p of probs) failures.push(`${tag}  ${p}`);
        }
      }
    }
  }

  assert.ok(checked > 14000, `expected to check every pair, only did ${checked}`);
  assert.deepStrictEqual(failures.slice(0, 10), [], `${failures.length} bad route segments`);
});
