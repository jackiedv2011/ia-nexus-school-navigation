'use strict';

// Routing to and from a PIN — a spot a student tapped on the floor plan rather
// than a room the plans name.
//
// A pin is the one endpoint the building's own data says nothing about: it can
// land in the middle of a room, in a stairwell, on a wall, or on the one
// hallway stub that connects to nothing. So the things worth pinning down are
// that the walk still starts and ends exactly where the student put it, still
// runs along mapped hallways, and still can't be sent somewhere unreachable.

const test = require('node:test');
const assert = require('node:assert');
const {
  findRoute, findPath, roomEndpoint, pointEndpoint,
  CORRIDORS, ROOM_DOORS, STAIR_POSITIONS,
} = require('../data/roomCoordinates');

const FLOORS = [1, 2, 3];
const EPS = 1e-6;
const JUNCTION_TOL = 30;

// Points that are allowed to sit off the hallway network: doorways, stairwell
// landings, and the pins this feature exists to route from.
function offNetwork(floor) {
  const s = new Set();
  for (const [k, doors] of Object.entries(ROOM_DOORS)) {
    if (parseInt(k.split(':')[0], 10) === floor) doors.forEach(d => s.add(d.join(',')));
  }
  for (const landings of Object.values(STAIR_POSITIONS)) {
    if (landings[floor]) s.add(landings[floor].join(','));
  }
  return s;
}
const OFF = { 1: offNetwork(1), 2: offNetwork(2), 3: offNetwork(3) };

// How far a segment spills past the ends of the corridor it lies along.
function overhang(a, b, floor) {
  const c = CORRIDORS[floor];
  let best = null;
  const consider = (o) => { if (best === null || o < best) best = o; };
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

// Every segment must run along a mapped hallway, except the stub (and its one
// right-angle elbow) that joins a pin, doorway or landing to the network.
function assertWalkable(leg, floor, pins, what) {
  const isOff = (p) => pins.has(p.join(',')) || OFF[floor].has(p.join(','));
  for (let i = 1; i < leg.length; i++) {
    const a = leg[i - 1], b = leg[i];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    assert.ok(a[0] === b[0] || a[1] === b[1],
      `${what}: diagonal ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    const o = overhang(a, b, floor);
    if (o !== null && o <= JUNCTION_TOL) continue;
    if (isOff(a) || isOff(b)) continue;
    const prev = leg[i - 2], next = leg[i + 1];
    if ((prev && isOff(prev)) || (next && isOff(next))) continue;
    assert.fail(`${what}: segment ${JSON.stringify(a)} -> ${JSON.stringify(b)} on floor ${floor} `
      + 'runs along no mapped hallway');
  }
}

// A deterministic spread of pins, so a failure is always reproducible.
function* samplePins(step = 170) {
  for (const floor of FLOORS) {
    for (let x = 150; x <= 2300; x += step) {
      for (let y = 150; y <= 1500; y += step) yield { x, y, floor };
    }
  }
}
const PINS = [...samplePins()];

test('a pinned route begins and ends exactly where the pin was dropped', () => {
  let checked = 0;
  for (let i = 0; i < PINS.length; i += 3) {
    const a = PINS[i], b = PINS[(i * 13 + 5) % PINS.length];
    const r = findRoute(pointEndpoint(a.x, a.y, a.floor), pointEndpoint(b.x, b.y, b.floor));
    const what = `(${a.x},${a.y})F${a.floor} -> (${b.x},${b.y})F${b.floor}`;
    assert.ok(!r.error, `${what}: ${r.error}`);
    assert.deepStrictEqual(r.path1[0], [a.x, a.y], `${what}: does not start at the pin`);
    const finish = (r.path2 && r.path2.length ? r.path2 : r.path1).at(-1);
    assert.deepStrictEqual(finish, [b.x, b.y], `${what}: does not end at the pin`);
    checked++;
  }
  assert.ok(checked >= 100, `expected a broad sample, only checked ${checked}`);
  console.log(`   ${checked} pinned routes start and end on their pins`);
});

test('every pinned route stays on mapped hallways and turns only at right angles', () => {
  let checked = 0;
  for (let i = 0; i < PINS.length; i += 4) {
    const a = PINS[i], b = PINS[(i * 29 + 17) % PINS.length];
    const r = findRoute(pointEndpoint(a.x, a.y, a.floor), pointEndpoint(b.x, b.y, b.floor));
    const what = `(${a.x},${a.y})F${a.floor} -> (${b.x},${b.y})F${b.floor}`;
    assert.ok(!r.error, `${what}: ${r.error}`);
    const pins = new Set([`${a.x},${a.y}`, `${b.x},${b.y}`]);
    assertWalkable(r.path1, a.floor, pins, `${what} leg1`);
    if (r.path2) assertWalkable(r.path2, b.floor, pins, `${what} leg2`);
    checked++;
  }
  console.log(`   ${checked} pinned routes stay on the hallways`);
});

// Floor 2 records a 68px hallway stub that touches nothing (KI-3). Room routes
// never noticed — no doorway projects onto it — but a pin dropped near the
// BioTech Lab lands on it, and before attachFreePoint learned to ignore
// islands, every such pin came back "no route" for a spot you can plainly walk
// to. This is the regression guard for that.
test('a pin near the disconnected floor-2 stub still routes', () => {
  // Coordinates whose nearest corridor IS the orphan stub {y:826, x 839..907}.
  const overTheStub = [[872, 572], [890, 851], [775, 782], [941, 806], [873, 826]];
  for (const [x, y] of overTheStub) {
    const r = findRoute(pointEndpoint(x, y, 2), roomEndpoint('223', 2));
    assert.ok(!r.error,
      `a pin at (${x},${y}) on floor 2 should route, got "${r.error}" — `
      + 'it has probably attached to the disconnected stub (KI-3)');
    assert.deepStrictEqual(r.path1[0], [x, y]);
  }
});

test('a pin can be either end, or both, and can cross floors', () => {
  const cases = [
    ['point -> point, same floor', pointEndpoint(700, 500, 1),  pointEndpoint(2000, 900, 1)],
    ['point -> point, 1 to 3',     pointEndpoint(700, 500, 1),  pointEndpoint(1300, 600, 3)],
    ['point -> room',              pointEndpoint(700, 500, 1),  roomEndpoint('331', 3)],
    ['room -> point',              roomEndpoint('188', 1),      pointEndpoint(1500, 700, 2)],
  ];
  for (const [what, from, to] of cases) {
    const r = findRoute(from, to);
    assert.ok(!r.error, `${what}: ${r.error}`);
    assert.ok(r.path1.length >= 2, `${what}: leg 1 is not drawable`);
    if (from.floor !== to.floor) {
      assert.ok(r.path2 && r.path2.length >= 2, `${what}: leg 2 is not drawable`);
      const landings = STAIR_POSITIONS[r.stairNum];
      assert.ok(landings && landings[from.floor] && landings[to.floor],
        `${what}: stair ${r.stairNum} does not serve both floors`);
      assert.deepStrictEqual(r.path1.at(-1), landings[from.floor], `${what}: leg 1 misses the stair`);
      assert.deepStrictEqual(r.path2[0], landings[to.floor], `${what}: leg 2 misses the stair`);
    }
    assert.ok(Number.isFinite(r.meters) && r.meters >= 0, `${what}: no distance`);
  }
});

// findPath is what the Route Finder, the chat and every other test call, and it
// keeps the cache that makes the bell survivable. Generalising it for pins must
// not have changed a single room-to-room answer.
test('room-to-room through findRoute is identical to findPath', () => {
  const pairs = [
    ['188', 1, '331', 3], ['123', 1, '223', 2], ['281/283', 2, '381/383', 3],
    ['233', 2, '362', 3], ['301', 3, '157', 1], ['GYM', 1, 'Courtyard', 1],
  ];
  for (const [fr, ff, tr, tf] of pairs) {
    assert.deepStrictEqual(
      findRoute(roomEndpoint(fr, ff), roomEndpoint(tr, tf)),
      findPath(fr, ff, tr, tf),
      `${fr}(F${ff}) -> ${tr}(F${tf}) differs between findRoute and findPath`,
    );
  }
});

test('a pin dropped on a doorway routes like asking for that room by name', () => {
  // Room 188's only doorway. Pinning it should produce the same walk as naming
  // it — that equivalence is what makes the pin trustworthy.
  const door = ROOM_DOORS['1:188'][0];
  const byPin  = findRoute(pointEndpoint(door[0], door[1], 1), roomEndpoint('157', 1));
  const byName = findRoute(roomEndpoint('188', 1), roomEndpoint('157', 1));
  assert.ok(!byPin.error && !byName.error);
  assert.deepStrictEqual(byPin.path1, byName.path1,
    'a pin on room 188\'s door should walk the same way as room 188 itself');
});

test('an unknown floor is refused rather than throwing', () => {
  for (const floor of [0, 4, 9, -1]) {
    const r = findRoute(pointEndpoint(700, 500, floor), roomEndpoint('188', 1));
    assert.strictEqual(r.error, 'Unknown floor', `floor ${floor} should be refused`);
  }
});
