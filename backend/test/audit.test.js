'use strict';

// Regression tests for the defects found in the end-to-end audit. Each one
// fails against the code as it stood before that audit's fix.

const test = require('node:test');
const assert = require('node:assert');
const {
  findPath, stairServes, stairsBetween, STAIR_POSITIONS, ROOM_LABELS,
  FLOOR_GRAPHS, ROOM_DOORS,
} = require('../data/roomCoordinates');
const { processMessage } = require('../chatbot-rules');

const FLOORS = [1, 2, 3];

// ─── findPath robustness ──────────────────────────────────────────────────────

// Previously threw "Cannot read properties of undefined (reading 'horizontal')"
// out of buildFloorGraph, which the API surfaced to the user as a 404 carrying
// that raw internal message.
test('findPath returns a clean error for a floor that does not exist', () => {
  for (const bad of [0, 4, 99, NaN, undefined, 'x']) {
    const r = findPath('188', 1, '188', bad);
    assert.ok(r && r.error, `floor ${bad} should produce an error result, not throw`);
    assert.deepStrictEqual(r.path1, []);
    assert.strictEqual(r.stairNum, null);
  }
  const r = findPath('188', 7, '331', 3);
  assert.ok(r.error, 'a bad SOURCE floor is rejected too');
});

test('findPath reports an unknown room instead of returning a silent empty path', () => {
  const sameFloor = findPath('999', 1, '188', 1);
  assert.ok(sameFloor.error, 'unknown same-floor room must set error');
  assert.deepStrictEqual(sameFloor.path1, []);

  const crossFloor = findPath('999', 1, '331', 3);
  assert.ok(crossFloor.error, 'unknown cross-floor room must set error');
});

// A successful result must never carry an undrawable path: the map needs at
// least two points, and the walking-time estimate is meaningless without them.
test('every successful route carries a drawable path', () => {
  for (const floor of FLOORS) {
    for (const from of ROOM_LABELS[floor]) {
      for (const to of ROOM_LABELS[floor]) {
        if (from === to) continue;
        const r = findPath(from, floor, to, floor);
        assert.ok(!r.error, `${from}->${to} on floor ${floor}: ${r.error}`);
        assert.ok(r.path1.length >= 2, `${from}->${to} on floor ${floor}: ${r.path1.length} point(s)`);
      }
    }
  }
});

test('source and destination being the same room is not an error', () => {
  const r = findPath('188', 1, '188', 1);
  assert.ok(!r.error);
  assert.strictEqual(r.path1.length, 2, 'collapses to a single doorway, returned twice so it can be drawn');
  assert.deepStrictEqual(r.path1[0], r.path1[1]);
});

// ─── Graph integrity ──────────────────────────────────────────────────────────

// Dijkstra is only as correct as the graph under it. These assert the
// properties the algorithm relies on rather than any particular route.
// The "room:in:"/"room:out:" terminals findPath attaches are excluded on
// purpose: they are deliberately zero-cost and deliberately one-way (see
// addRoomTerminal), and they are the one thing in the graph that is allowed to
// break these rules.
const isTerminal = (id) => id.startsWith('room:');

test('every floor graph has only positive, symmetric, non-dangling edges', () => {
  for (const floor of FLOORS) {
    const { nodes, edges } = FLOOR_GRAPHS[floor];
    for (const [from, list] of Object.entries(edges)) {
      if (isTerminal(from)) continue;
      assert.ok(list.length > 0, `floor ${floor}: node ${from} has no edges`);
      const seen = new Set();
      for (const e of list) {
        if (isTerminal(e.to)) continue;
        assert.ok(Number.isFinite(e.dist) && e.dist > 0,
          `floor ${floor}: edge ${from}->${e.to} has weight ${e.dist}`);
        assert.notStrictEqual(e.to, from, `floor ${floor}: self-loop at ${from}`);
        assert.ok(!seen.has(e.to), `floor ${floor}: duplicate edge ${from}->${e.to}`);
        seen.add(e.to);
        assert.ok(nodes[e.to], `floor ${floor}: edge to undefined node ${e.to}`);
        assert.ok(edges[e.to].some(back => back.to === from),
          `floor ${floor}: ${from}->${e.to} is one-way; hallways must be walkable both ways`);
      }
    }
  }
});

// A doorway or stair landing that lands in an isolated pocket of the corridor
// network is unroutable, and the failure only shows up as "no route" for that
// one room. Catch it structurally instead.
test('every doorway and stair landing is reachable from every other one', () => {
  for (const floor of FLOORS) {
    const { edges } = FLOOR_GRAPHS[floor];
    const attachments = [];
    for (const [key, doors] of Object.entries(ROOM_DOORS)) {
      if (parseInt(key.split(':')[0], 10) === floor) {
        for (const d of doors) attachments.push(`${d[0]},${d[1]}`);
      }
    }
    for (const landings of Object.values(STAIR_POSITIONS)) {
      if (landings[floor]) attachments.push(`${landings[floor][0]},${landings[floor][1]}`);
    }
    assert.ok(attachments.length > 0);

    const seen = new Set([attachments[0]]);
    const queue = [attachments[0]];
    while (queue.length) {
      const curr = queue.pop();
      for (const e of edges[curr] || []) {
        if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
      }
    }
    for (const a of attachments) {
      assert.ok(seen.has(a), `floor ${floor}: ${a} is cut off from the rest of the hallway network`);
    }
  }
});

// ─── Stairwell availability ───────────────────────────────────────────────────

test('stairServes / stairsBetween agree with STAIR_POSITIONS', () => {
  // Stairs 1 and 3 have no floor-1 landing (verified against the school's
  // marked-up plans — see the STAIR_POSITIONS comment).
  for (const id of [1, 3]) {
    assert.strictEqual(stairServes(id, 1, 2), false, `stair ${id} must not serve floor 1`);
    assert.strictEqual(stairServes(id, 2, 3), true, `stair ${id} serves floors 2-3`);
  }
  for (const id of [2, 4, 5, 7, 8, 9]) {
    assert.strictEqual(stairServes(id, 1, 3), true, `stair ${id} runs the full height`);
  }
  assert.deepStrictEqual(stairsBetween(1, 3), [2, 4, 5, 7, 8, 9]);
  assert.deepStrictEqual(stairsBetween(2, 3), [1, 2, 3, 4, 5, 7, 8, 9]);
  assert.strictEqual(stairServes(99, 1, 2), false, 'an unknown stair id is never usable');
});

// ─── Rule-engine directions ───────────────────────────────────────────────────

// The original bug: the wing table sent rooms 140-163 to "Stair 2.1", a
// stairwell with no floor-1 landing at all, so a student was told to look for a
// staircase that is not there while the map showed a different walk entirely.
//
// The wing table no longer describes routes — buildNavigation asks findPath, so
// the chat and the map are the same answer by construction. These tests hold
// that line for every pair of rooms the chatbot can be asked about.
test('chat directions and the Route Finder name the same stairwell, for every pair', () => {
  const stairLine = /\*\*Stairwell:\*\* Stair (\d+) —/;
  let crossFloor = 0, sameFloor = 0;
  for (const fromFloor of FLOORS) {
    for (const toFloor of FLOORS) {
      for (const from of ROOM_LABELS[fromFloor]) {
        for (const to of ROOM_LABELS[toFloor]) {
          // Only numeric rooms reach the navigation path (the message parser
          // extracts digits); a shared-door pair is asked about by one half.
          const f = String(from).split('/')[0], t = String(to).split('/')[0];
          if (!/^\d{3}$/.test(f) || !/^\d{3}$/.test(t) || f === t) continue;

          const text = processMessage(`How do I get from room ${f} to room ${t}?`).text;
          const routed = findPath(f, fromFloor, t, toFloor);

          if (fromFloor === toFloor) {
            assert.ok(text.includes('**Stairs:** none needed'),
              `${f} -> ${t} on floor ${fromFloor}: same-floor trip should need no stairs:\n${text}`);
            assert.ok(!stairLine.test(text), `${f} -> ${t}: named a stairwell on a same-floor trip`);
            sameFloor++;
            continue;
          }

          const m = text.match(stairLine);
          assert.ok(m, `${f} (F${fromFloor}) -> ${t} (F${toFloor}): no stairwell named:\n${text}`);
          const stair = Number(m[1]);
          assert.strictEqual(stair, routed.stairNum,
            `${f} (F${fromFloor}) -> ${t} (F${toFloor}): chat says Stair ${stair}, map routes via Stair ${routed.stairNum}`);
          assert.ok(stairServes(stair, fromFloor, toFloor),
            `${f} -> ${t}: Stair ${stair} has no landing on one of floors ${fromFloor}/${toFloor}`);
          crossFloor++;
        }
      }
    }
  }
  assert.ok(crossFloor > 1000, `expected many cross-floor pairs, checked ${crossFloor}`);
  assert.ok(sameFloor > 500, `expected many same-floor pairs, checked ${sameFloor}`);
});

// The walk quoted in chat has to be the walk the map draws, not a second
// estimate — they used to be computed in different places from different data.
test('the distance and time quoted in chat match the routed path', () => {
  for (const [from, fromFloor, to, toFloor] of [
    ['147', 1, '346', 3], ['157', 1, '351', 3], ['192', 1, '392', 3],
    ['188', 1, '331', 3], ['253', 2, '351', 3], ['242', 2, '147', 1],
    ['188', 1, '192', 1], ['331', 3, '359', 3],
  ]) {
    const routed = findPath(from, fromFloor, to, toFloor);
    const text = processMessage(`How do I get from room ${from} to room ${to}?`).text;
    assert.ok(text.includes(`about ${routed.minutes} min`),
      `${from} -> ${to}: chat should quote ${routed.minutes} min:\n${text}`);
    assert.ok(text.includes(`roughly ${routed.meters} m`),
      `${from} -> ${to}: chat should quote ${routed.meters} m:\n${text}`);
  }
});

test('a room that is not on the plans is refused, not routed', () => {
  for (const q of ['How do I get from room 188 to room 999?',
                   'How do I get from room 999 to room 188?']) {
    const r = processMessage(q);
    assert.strictEqual(r.resolved, false, 'an unroutable question is marked unresolved');
    assert.ok(r.text.includes("couldn't find"), r.text);
    assert.ok(!/Stairwell:/.test(r.text), 'must not offer a stairwell for a room that does not exist');
  }
});

// getRoomCluster returns the FIRST matching range, so an overlapping wing
// listed after its container could never win. 157 sits inside both 140-163 and
// 155-163; 191/192 inside both 181-199 and 191-199.
test('an overlapping wing resolves to the narrower, nearer range', () => {
  const cases = [
    { room: '157', wing: 'Locker Rooms & FCS Wing' },
    { room: '192', wing: 'Visual Arts & Media Arts Wing' },
    { room: '191', wing: 'Visual Arts & Media Arts Wing' },
    { room: '147', wing: 'Nursing & EMS Labs' },
    { room: '188', wing: 'Engineering & Manufacturing Wing' },
  ];
  for (const c of cases) {
    const text = processMessage(`How do I get from room ${c.room} to room 331?`).text;
    assert.ok(text.includes(`(${c.wing})`), `room ${c.room} should be in ${c.wing}:\n${text}`);
  }
});
