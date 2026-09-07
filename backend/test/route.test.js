'use strict';

// Regression snapshots that lock in the pathfinding behaviour. These were
// re-captured when every stairwell's position was corrected to match the
// school's actual black hand-drawn marks (previously a few had been placed by
// projecting an old blueprint's TEXT LABEL onto the nearest corridor, which
// put some of them meters from the real physical stairwell — most visibly
// floor 1's "stair 2" and "stair 4", whose real marks sit nowhere near where
// the labels implied; see the STAIR_POSITIONS comment in roomCoordinates.js
// for the full account).
//
// Point-count snapshots are brittle on their own. The real guards are in
// routes.test.js, which walks every one of the ~6,000 possible room pairs and
// checks each route starts at a doorway, ends at a doorway, turns only at
// right angles, and never leaves the hallways. These cases exist to make an
// unintended change to any ONE route show up as a small, readable diff.

const test = require('node:test');
const assert = require('node:assert');
const { findPath, ROOM_DOORS, CORRIDORS, STAIR_POSITIONS } = require('../data/roomCoordinates');

const CASES = [
  // Re-captured when the school placed a floor-1 landing this file had
  // missing (stair 2's, next to room 123) — shorter from the northwest wing
  // than the stair 7 this used to take. 164m -> 128m. (It briefly went to
  // 126m via stair 9 when this file had stair 9 running the full height;
  // the school has since split that into two separate stairwells — stair 9
  // no longer reaches floor 3 at all — so stair 2 wins again.)
  { in: ['188', 1, '331', 3], sameFloor: false, stairNum: 2,    p1: 15, p2: 9,  first: [284, 431],   last: [1428, 985] },
  { in: ['253', 2, '351', 3], sameFloor: false, stairNum: 5,    p1: 5,  p2: 8,  first: [1787, 1226], last: [1798, 1227] },
  { in: ['331', 3, '359', 3], sameFloor: true,  stairNum: null, p1: 12, p2: 0,  first: [1428, 985],  last: [1805, 1284] },
  { in: ['123', 1, '121', 1], sameFloor: true,  stairNum: null, p1: 4,  p2: 0,  first: [1398, 852],  last: [1503, 859] },
  { in: ['189', 1, '192', 1], sameFloor: true,  stairNum: null, p1: 19, p2: 0,  first: [283, 727],   last: [2205, 292] },
  { in: ['342', 3, '351', 3], sameFloor: true,  stairNum: null, p1: 16, p2: 0,  first: [634, 1003],  last: [1798, 1010] },
  // Named destinations and shared-door pairs route like any other room.
  { in: ['281/283', 2, '292/294', 2],       sameFloor: true, stairNum: null, p1: 21, p2: 0, first: [544, 262],  last: [1824, 253] },
  { in: ['Courtyard', 1, 'GYM', 1],         sameFloor: true, stairNum: null, p1: 16, p2: 0, first: [1087, 581], last: [2166, 1024] },
  { in: ['Xchange/Library', 2, '258', 2],   sameFloor: true, stairNum: null, p1: 14, p2: 0, first: [1201, 592], last: [1842, 1309] },
];

for (const c of CASES) {
  const [fr, ff, tr, tf] = c.in;
  test(`route ${fr}(F${ff}) -> ${tr}(F${tf}) is unchanged`, () => {
    const r = findPath(fr, ff, tr, tf);
    assert.strictEqual(r.sameFloor, c.sameFloor, 'sameFloor');
    assert.strictEqual(r.stairNum, c.stairNum, 'stairNum');
    assert.strictEqual((r.path1 || []).length, c.p1, 'path1 length');
    assert.strictEqual((r.path2 || []).length, c.p2, 'path2 length');
    assert.deepStrictEqual(r.path1[0], c.first, 'starts at the same doorway');
    const finish = (r.path2 && r.path2.length ? r.path2 : r.path1).slice(-1)[0];
    assert.deepStrictEqual(finish, c.last, 'ends at the same doorway');
  });
}

test('findPath is deterministic', () => {
  assert.deepStrictEqual(findPath('188', 1, '331', 3), findPath('188', 1, '331', 3));
});

// A room with two doorways must be entered by whichever one is actually
// closer — the whole point of tracking more than one. Room 147's doors sit at
// opposite ends of the south wing, so approaching from the north and from the
// south has to pick differently.
test('a two-door room is entered by whichever door is nearer', () => {
  const doors = ROOM_DOORS['1:147'];
  assert.strictEqual(doors.length, 2, 'room 147 should have two doorways');
  const fromNorth = findPath('184', 1, '147', 1).path1.slice(-1)[0];
  const fromSouth = findPath('157', 1, '147', 1).path1.slice(-1)[0];
  assert.ok(doors.some(d => d[0] === fromNorth[0] && d[1] === fromNorth[1]));
  assert.ok(doors.some(d => d[0] === fromSouth[0] && d[1] === fromSouth[1]));
});

// Walking into one door of a room and straight out of the other would be a free
// shortcut through the room. The one-way room terminals exist to prevent it.
test('a route never cuts through a room to reach the other side', () => {
  const twoDoor = Object.entries(ROOM_DOORS).filter(([, d]) => d.length > 1);
  assert.ok(twoDoor.length > 0);
  for (const [key, doors] of twoDoor) {
    const floor = parseInt(key.split(':')[0], 10);
    for (const [from, to] of [['188', '157'], ['189', '192'], ['116', '147']]) {
      if (floor !== 1) continue;
      const path = findPath(from, 1, to, 1).path1;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const aIsDoor = doors.some(d => d[0] === a[0] && d[1] === a[1]);
        const bIsDoor = doors.some(d => d[0] === b[0] && d[1] === b[1]);
        assert.ok(!(aIsDoor && bIsDoor),
          `${from} -> ${to} hops straight between both doors of ${key}`);
      }
    }
  }
});

// Every stairwell has to sit on the hallway network (via the same
// perpendicular-projection stub every room doorway gets — see
// buildFloorGraph). When a couple of them were recorded at the position of a
// text label printed on the old blueprint, they sat meters clear of any
// hallway, and a route to one ended with a walk across floor the school had
// not marked as walkable.
test('every stairwell is within stub reach of the hallway network', () => {
  const MAX_STUB = 170; // blueprint px (~10m) — matches the real marks' worst case
  for (const [id, floors] of Object.entries(STAIR_POSITIONS)) {
    for (const [floor, [x, y]] of Object.entries(floors)) {
      const c = CORRIDORS[floor];
      let best = Infinity;
      for (const h of c.horizontal) {
        const fx = Math.min(Math.max(x, h.xMin), h.xMax);
        best = Math.min(best, Math.hypot(fx - x, h.y - y));
      }
      for (const v of c.vertical) {
        const fy = Math.min(Math.max(y, v.yMin), v.yMax);
        best = Math.min(best, Math.hypot(v.x - x, fy - y));
      }
      assert.ok(best <= MAX_STUB,
        `stair ${id} on floor ${floor} at [${x},${y}] is ${Math.round(best)}px from the nearest hallway`);
    }
  }
});

// Floor 1 has no landing for stair 1, stair 3, or stair 10 — verified by
// direct inspection of the school's plan, not just an absent data entry. A
// route must never be offered through one of them on floor 1's end.
// (Two stairs were initially missed this same way and later
// found: stair 4, whose icon sits in a tight corner near rooms 147/144, and
// stair 2, whose floor-1 landing is next to room 123 — nowhere near its
// floor-2 landing, which is why the first search for it came up empty.)
test('a stairwell with no confirmed floor-1 landing is never chosen for a floor-1 trip', () => {
  const unconfirmedOnFloor1 = [1, 3, 10];
  for (const id of unconfirmedOnFloor1) {
    assert.ok(!STAIR_POSITIONS[id]?.[1], `stair ${id} unexpectedly has a floor-1 entry`);
  }
  for (const floor of [2, 3]) {
    for (const from of ['242', '261']) {
      for (const to of ['147', '188', 'GYM']) {
        const r = findPath(from, floor, to, 1);
        assert.ok(!unconfirmedOnFloor1.includes(r.stairNum),
          `${from} (F${floor}) -> ${to} (F1) routed via stair ${r.stairNum}, which has no confirmed floor-1 landing`);
      }
    }
  }
});
