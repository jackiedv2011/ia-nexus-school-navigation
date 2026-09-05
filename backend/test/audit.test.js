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
  // Stairs 1, 2 and 3 have no floor-1 landing (verified against the school's
  // marked-up plans — see the STAIR_POSITIONS comment).
  for (const id of [1, 2, 3]) {
    assert.strictEqual(stairServes(id, 1, 2), false, `stair ${id} must not serve floor 1`);
    assert.strictEqual(stairServes(id, 2, 3), true, `stair ${id} serves floors 2-3`);
  }
  for (const id of [4, 5, 6, 7, 8]) {
    assert.strictEqual(stairServes(id, 1, 3), true, `stair ${id} runs the full height`);
  }
  assert.deepStrictEqual(stairsBetween(1, 3), [4, 5, 6, 7, 8]);
  assert.deepStrictEqual(stairsBetween(2, 3), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(stairServes(99, 1, 2), false, 'an unknown stair id is never usable');
});

// ─── Rule-engine directions ───────────────────────────────────────────────────

// The bug: the wing table sent rooms 140-163 to "Stair 2.1", a stairwell with
// no floor-1 landing at all. A student following those directions would look
// for a staircase that is not there, while the Route Finder's map showed a
// completely different (correct) walk for the same trip.
test('chat directions never name a stairwell that does not serve the trip', () => {
  const stairLine = /\*\*Stairwell:\*\* Stair (\d+)\.(\d) → Stair \1\.(\d)/;
  let checked = 0;
  for (const fromFloor of FLOORS) {
    for (const toFloor of FLOORS) {
      if (fromFloor === toFloor) continue;
      for (const from of ROOM_LABELS[fromFloor]) {
        for (const to of ROOM_LABELS[toFloor]) {
          // Only numeric rooms reach the navigation path (the message parser
          // extracts digits), and shared-door pairs like "281/283" are asked
          // about by one half at a time.
          const f = String(from).split('/')[0], t = String(to).split('/')[0];
          if (!/^\d{3}$/.test(f) || !/^\d{3}$/.test(t)) continue;

          const text = processMessage(`How do I get from room ${f} to room ${t}?`).text;
          const m = text.match(stairLine);
          assert.ok(m, `${f} -> ${t}: no stairwell line in the directions:\n${text}`);
          const stair = Number(m[1]);
          assert.ok(stairServes(stair, fromFloor, toFloor),
            `${f} (F${fromFloor}) -> ${t} (F${toFloor}) was routed via Stair ${stair}, `
            + `which has no landing on floor ${stairServes(stair, fromFloor, fromFloor) ? toFloor : fromFloor}`);
          // Every stairwell named anywhere in the body must be that same one.
          for (const named of text.matchAll(/Stair (\d+)\.(\d)/g)) {
            assert.strictEqual(Number(named[1]), stair,
              `${f} -> ${t}: directions mention Stair ${named[1]} but route via Stair ${stair}`);
            assert.ok(STAIR_POSITIONS[named[1]]?.[Number(named[2])],
              `${f} -> ${t}: directions mention Stair ${named[0]}, which has no such landing`);
          }
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 100, `expected to check many pairs, checked ${checked}`);
});

// getRoomCluster takes the FIRST matching range, so an overlapping wing listed
// after its container could never win. 157 sat inside both 140-163 and 155-163;
// 191/192 inside both 181-199 and 191-199.
test('an overlapping wing resolves to the narrower, nearer range', () => {
  const cases = [
    { room: '157', stair: 5, wing: 'Locker Rooms & FCS Wing' },
    { room: '192', stair: 8, wing: 'Visual Arts & Media Arts Wing' },
    { room: '191', stair: 8, wing: 'Visual Arts & Media Arts Wing' },
    { room: '147', stair: 4, wing: 'Nursing & EMS Labs' },
    { room: '188', stair: 6, wing: 'Engineering & Manufacturing Wing' },
  ];
  for (const c of cases) {
    const text = processMessage(`How do I get from room ${c.room} to room 331?`).text;
    assert.ok(text.includes(`(${c.wing})`), `room ${c.room} should be in ${c.wing}:\n${text}`);
    assert.ok(text.includes(`**Stairwell:** Stair ${c.stair}.1`),
      `room ${c.room} should use Stair ${c.stair}:\n${text}`);
  }
});

// The wing tables give one stairwell per WING, while the Route Finder picks the
// shortest for each specific PAIR of rooms, so the two legitimately differ on
// many trips (both stairwells are real and walkable — see KNOWN-ISSUES.md).
// What must never differ is the trips whose wing table named a stairwell that
// does not physically exist on that floor: those now follow the map.
test('the trips whose wing table was wrong now follow the Route Finder', () => {
  for (const [from, fromFloor, to, toFloor] of [
    ['147', 1, '346', 3],   // was "Stair 2.1" — no such landing on floor 1
    ['144', 1, '349', 3],   // same wing, same bug
    ['147', 1, '246', 2],
  ]) {
    const routed = findPath(from, fromFloor, to, toFloor);
    assert.ok(routed.stairNum, `${from} -> ${to}: the map should route this`);
    const text = processMessage(`How do I get from room ${from} to room ${to}?`).text;
    assert.ok(text.includes(`**Stairwell:** Stair ${routed.stairNum}.`),
      `${from} -> ${to}: map routes via Stair ${routed.stairNum}, directions say otherwise:\n${text}`);
  }
});

// Whatever stairwell the directions choose, the LANDING they name has to exist.
test('every stairwell the directions name has a real landing on that floor', () => {
  for (const [from, to] of [['147', '346'], ['157', '351'], ['192', '392'],
                            ['188', '331'], ['253', '351'], ['242', '147'],
                            ['144', '242'], ['116', '363'], ['301', '188']]) {
    const text = processMessage(`How do I get from room ${from} to room ${to}?`).text;
    const named = [...text.matchAll(/Stair (\d+)\.(\d)/g)];
    assert.ok(named.length > 0, `${from} -> ${to}: no stairwell named:\n${text}`);
    for (const n of named) {
      assert.ok(STAIR_POSITIONS[n[1]]?.[Number(n[2])],
        `${from} -> ${to}: directions name Stair ${n[0]}, which has no landing there`);
    }
  }
});
