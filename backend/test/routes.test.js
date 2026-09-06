'use strict';

// Exhaustive check of the route finder against the school's marked-up plans:
// every ordered pair of rooms in the building, on every floor and between
// floors. The three things that have to hold for every one of them are that a
// route exists at all, that it starts and ends at an actual doorway, and that
// everything in between stays on a hallway.

const test = require('node:test');
const assert = require('node:assert');
const {
  findPath, ROOM_LABELS, ROOM_DOORS, CORRIDORS, STAIR_POSITIONS,
} = require('../data/roomCoordinates');

const FLOORS = [1, 2, 3];
const EPS = 1.5;   // px of slack for a point sitting "on" a corridor

const key = (room, floor) => `${floor}:${String(room).toLowerCase().replace(/\s+/g, '')}`;
const doorsOf = (room, floor) => ROOM_DOORS[key(room, floor)] || [];
const same = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

// Points that are allowed to sit off the hallway network: a doorway, and a
// stairwell landing. Everything else on a path has to be in a corridor.
function offNetworkPoints(floor) {
  const pts = [];
  for (const [k, doors] of Object.entries(ROOM_DOORS)) {
    if (parseInt(k.split(':')[0], 10) === floor) pts.push(...doors);
  }
  for (const floors of Object.values(STAIR_POSITIONS)) {
    if (floors[floor]) pts.push(floors[floor]);
  }
  return pts;
}

// Every leg of a walk must be a straight horizontal or vertical move — a
// diagonal would mean cutting through whatever is in between.
function checkAxisAligned(path, what) {
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    assert.ok(
      Math.abs(x1 - x0) < EPS || Math.abs(y1 - y0) < EPS,
      `${what}: diagonal leg ${JSON.stringify(path[i - 1])} -> ${JSON.stringify(path[i])}`,
    );
  }
}

// Every SEGMENT of the walk has to run along a mapped hallway — not merely
// have its endpoints sit on one.
//
// This used to check the points only, and counted anything unexplained up to
// a budget of two per leg. That is weaker than it looks: two points can each
// sit on a different corridor while the line between them cuts straight
// across floor the school never marked as walkable, and a point-wise check
// waves it through. The budget also meant a genuine stray could hide behind
// the allowance made for elbows.
//
// So each segment must be one of:
//   * collinear with a mapped corridor and inside its recorded extent;
//   * the same, within JUNCTION_TOL — the documented slack that lets a
//     junction recorded a few pixels short of touching still connect
//     (buildFloorGraph relies on it; measured worst case in this building is
//     26px of the 30px allowed);
//   * a stub or right-angle elbow joining a doorway or stair landing to the
//     network — the one part of a walk that is legitimately off-hallway.
// Anything else fails.
const JUNCTION_TOL = 30;

// How far segment a-b spills past the ends of the nearest corridor it lies
// along. 0 means strictly inside; null means no corridor is collinear with it.
function overhangAlongCorridor(a, b, floor) {
  const c = CORRIDORS[floor];
  let best = null;
  const consider = (over) => { if (best === null || over < best) best = over; };
  if (Math.abs(a[1] - b[1]) < EPS) {
    for (const h of c.horizontal) {
      if (Math.abs(a[1] - h.y) > EPS) continue;
      const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      consider(Math.max(0, h.xMin - lo) + Math.max(0, hi - h.xMax));
    }
  }
  if (Math.abs(a[0] - b[0]) < EPS) {
    for (const v of c.vertical) {
      if (Math.abs(a[0] - v.x) > EPS) continue;
      const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
      consider(Math.max(0, v.yMin - lo) + Math.max(0, hi - v.yMax));
    }
  }
  return best;
}

function checkOnHallways(path, floor, what) {
  const offNetwork = offNetworkPoints(floor);
  const isOffNetwork = (p) => offNetwork.some((a) => same(a, p));

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (same(a, b)) continue;

    const over = overhangAlongCorridor(a, b, floor);
    if (over !== null && over <= JUNCTION_TOL) continue;

    // A stub out of a doorway or stair landing, or the elbow next to one.
    if (isOffNetwork(a) || isOffNetwork(b)) continue;
    const prev = path[i - 2], next = path[i + 1];
    if ((prev && isOffNetwork(prev)) || (next && isOffNetwork(next))) continue;

    assert.fail(`${what}: segment ${JSON.stringify(a)} -> ${JSON.stringify(b)} on floor ${floor} `
      + `does not run along any mapped hallway `
      + `(${over === null ? 'no corridor is collinear with it' : `spills ${Math.round(over)}px past the corridor's end`})`);
  }
}

test('every room on the plans has at least one doorway', () => {
  for (const floor of FLOORS) {
    for (const room of ROOM_LABELS[floor]) {
      assert.ok(doorsOf(room, floor).length > 0, `floor ${floor}: ${room} has no doorway`);
    }
  }
});

for (const floor of FLOORS) {
  test(`floor ${floor}: every room-to-room route on the same floor`, () => {
    const rooms = ROOM_LABELS[floor];
    let checked = 0;
    for (const from of rooms) {
      for (const to of rooms) {
        if (from === to) continue;
        const what = `floor ${floor} ${from} -> ${to}`;
        const r = findPath(from, floor, to, floor);
        assert.ok(!r.error, `${what}: ${r.error}`);
        assert.ok(r.path1.length >= 2, `${what}: path has ${r.path1.length} point(s)`);

        const fromDoors = doorsOf(from, floor);
        const toDoors = doorsOf(to, floor);
        assert.ok(fromDoors.some(d => same(d, r.path1[0])),
          `${what}: starts at ${JSON.stringify(r.path1[0])}, not a doorway of ${from}`);
        assert.ok(toDoors.some(d => same(d, r.path1[r.path1.length - 1])),
          `${what}: ends at ${JSON.stringify(r.path1.at(-1))}, not a doorway of ${to}`);

        checkAxisAligned(r.path1, what);
        checkOnHallways(r.path1, floor, what);
        checked++;
      }
    }
    assert.ok(checked > 0);
    console.log(`   floor ${floor}: ${checked} same-floor routes verified`);
  });
}

test('every room-to-room route between different floors', () => {
  let checked = 0;
  for (const fromFloor of FLOORS) {
    for (const toFloor of FLOORS) {
      if (fromFloor === toFloor) continue;
      for (const from of ROOM_LABELS[fromFloor]) {
        for (const to of ROOM_LABELS[toFloor]) {
          const what = `${from} (F${fromFloor}) -> ${to} (F${toFloor})`;
          const r = findPath(from, fromFloor, to, toFloor);
          assert.ok(!r.error, `${what}: ${r.error}`);
          assert.ok(r.path1.length >= 2 && r.path2.length >= 2, `${what}: empty leg`);

          assert.ok(doorsOf(from, fromFloor).some(d => same(d, r.path1[0])),
            `${what}: leg 1 does not start at a doorway of ${from}`);
          assert.ok(same(r.path1.at(-1), STAIR_POSITIONS[r.stairNum][fromFloor]),
            `${what}: leg 1 does not end at stair ${r.stairNum}`);
          assert.ok(same(r.path2[0], STAIR_POSITIONS[r.stairNum][toFloor]),
            `${what}: leg 2 does not start at stair ${r.stairNum}`);
          assert.ok(doorsOf(to, toFloor).some(d => same(d, r.path2.at(-1))),
            `${what}: leg 2 does not end at a doorway of ${to}`);

          checkAxisAligned(r.path1, `${what} leg1`);
          checkAxisAligned(r.path2, `${what} leg2`);
          checkOnHallways(r.path1, fromFloor, `${what} leg1`);
          checkOnHallways(r.path2, toFloor, `${what} leg2`);
          checked++;
        }
      }
    }
  }
  console.log(`   ${checked} cross-floor routes verified`);
});

test('a stairwell with no landing on floor 1 is never chosen for a floor-1 trip', () => {
  for (const floor of [2, 3]) {
    for (const from of ROOM_LABELS[floor]) {
      for (const to of ROOM_LABELS[1]) {
        const r = findPath(from, floor, to, 1);
        assert.ok(STAIR_POSITIONS[r.stairNum]?.[1],
          `${from} (F${floor}) -> ${to} (F1) routed via stair ${r.stairNum}, which has no floor-1 landing`);
      }
    }
  }
});
