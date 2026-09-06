'use strict';

// Does findPath actually return the SHORTEST route?
//
// Nothing else in this suite asks that. routes.test.js proves every route is
// well-formed — starts at a doorway, ends at a doorway, turns only at right
// angles, never leaves the hallways — but a route can be all of those things
// and still be needlessly long. A bug in the stairwell enumeration, or in the
// one-way room terminals that pick between a room's doorways, would produce a
// valid, drawable, wrong answer, and every other test would pass.
//
// So this recomputes the optimum INDEPENDENTLY and compares. It deliberately
// does not reuse findPath's stairwell or doorway selection: it brute-forces
// every (source doorway x destination doorway x stairwell) combination with
// its own Dijkstra over the exported floor graphs. The only thing it shares
// with the code under test is the graph itself.
//
// Written after the school corrected two floor-1 stairwell landings, which
// re-routed about a quarter of all cross-floor trips — exactly the kind of
// change where "still valid" and "still shortest" can quietly diverge.

const test = require('node:test');
const assert = require('node:assert');
const {
  findPath, ROOM_LABELS, ROOM_DOORS, STAIR_POSITIONS, FLOOR_GRAPHS,
} = require('../data/roomCoordinates');

const FLOORS = [1, 2, 3];
const key = (p) => `${p[0]},${p[1]}`;

// Single source -> every node, over the BASE graph. The "room:" terminals
// findPath adds per query are skipped: they are zero-cost and one-way, and
// this needs the real hallway distances.
function distancesFrom(graph, startKey) {
  const { nodes, edges } = graph;
  const dist = new Map();
  if (!nodes[startKey]) return dist;
  dist.set(startKey, 0);
  const visited = new Set();
  const queue = [[0, startKey]];
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, u] = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    for (const e of edges[u] || []) {
      if (e.to.startsWith('room:')) continue;
      const next = d + e.dist;
      if (next < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, next); queue.push([next, e.to]); }
    }
  }
  return dist;
}

// One Dijkstra per attachment point per floor, reused across every query that
// starts there — ~150 in total, which keeps this test in the seconds.
const tables = { 1: new Map(), 2: new Map(), 3: new Map() };
function table(floor, k) {
  if (!tables[floor].has(k)) tables[floor].set(k, distancesFrom(FLOOR_GRAPHS[floor], k));
  return tables[floor].get(k);
}

function doorsOf(room, floor) {
  const norm = `${floor}:${String(room).toLowerCase().replace(/\s+/g, '')}`;
  if (ROOM_DOORS[norm]) return ROOM_DOORS[norm];
  for (const [k, v] of Object.entries(ROOM_DOORS)) {   // shared-door pair
    const [f, name] = k.split(':');
    if (parseInt(f, 10) !== floor || !name.includes('/')) continue;
    if (name.split('/').some((h) => `${floor}:${h.trim()}` === norm)) return v;
  }
  return null;
}

const pathCost = (p) => {
  let c = 0;
  for (let i = 1; i < p.length; i++) c += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return c;
};

// The cheapest walk over every combination the router had to choose between.
function bruteForceOptimum(from, fromFloor, to, toFloor) {
  const dFrom = doorsOf(from, fromFloor), dTo = doorsOf(to, toFloor);
  if (!dFrom || !dTo) return null;
  let best = Infinity, viaStair = null;

  if (fromFloor === toFloor) {
    for (const a of dFrom) for (const b of dTo) {
      const d = table(fromFloor, key(a)).get(key(b));
      if (d !== undefined && d < best) best = d;
    }
    return { cost: best, viaStair: null };
  }

  for (const [id, landings] of Object.entries(STAIR_POSITIONS)) {
    if (!landings[fromFloor] || !landings[toFloor]) continue;
    for (const a of dFrom) {
      const up = table(fromFloor, key(a)).get(key(landings[fromFloor]));
      if (up === undefined) continue;
      for (const b of dTo) {
        const down = table(toFloor, key(landings[toFloor])).get(key(b));
        if (down === undefined) continue;
        if (up + down < best) { best = up + down; viaStair = Number(id); }
      }
    }
  }
  return { cost: best, viaStair };
}

// Half a pixel of slack, for floating-point accumulation over a path with
// dozens of segments. Any real routing mistake is metres, not fractions.
const SLACK = 0.5;

test('every same-floor route is the shortest walk available', () => {
  let checked = 0;
  for (const floor of FLOORS) {
    for (const from of ROOM_LABELS[floor]) {
      for (const to of ROOM_LABELS[floor]) {
        if (from === to) continue;
        const r = findPath(from, floor, to, floor);
        assert.ok(!r.error, `${from} -> ${to} on floor ${floor}: ${r.error}`);
        const optimum = bruteForceOptimum(from, floor, to, floor);
        if (!optimum || !Number.isFinite(optimum.cost)) continue;
        const actual = pathCost(r.path1);
        assert.ok(actual <= optimum.cost + SLACK,
          `${from} -> ${to} on floor ${floor}: walked ${Math.round(actual)}px, `
          + `but ${Math.round(optimum.cost)}px was available`);
        checked++;
      }
    }
  }
  console.log(`   ${checked} same-floor routes are optimal`);
});

test('every cross-floor route takes the best doorway/stairwell combination', () => {
  let checked = 0;
  for (const fromFloor of FLOORS) {
    for (const toFloor of FLOORS) {
      if (fromFloor === toFloor) continue;
      for (const from of ROOM_LABELS[fromFloor]) {
        for (const to of ROOM_LABELS[toFloor]) {
          const r = findPath(from, fromFloor, to, toFloor);
          const what = `${from} (F${fromFloor}) -> ${to} (F${toFloor})`;
          assert.ok(!r.error, `${what}: ${r.error}`);
          const optimum = bruteForceOptimum(from, fromFloor, to, toFloor);
          if (!optimum || !Number.isFinite(optimum.cost)) continue;
          const actual = pathCost(r.path1) + pathCost(r.path2);
          assert.ok(actual <= optimum.cost + SLACK,
            `${what}: walked ${Math.round(actual)}px via stair ${r.stairNum}, `
            + `but ${Math.round(optimum.cost)}px was available via stair ${optimum.viaStair}`);
          checked++;
        }
      }
    }
  }
  console.log(`   ${checked} cross-floor routes are optimal`);
});

// A route's two legs must meet at ONE stairwell — the same one on both floors.
// Landing on floor 2 at stair 4 and resuming on floor 3 at stair 7 would draw
// a map that teleports, and the distance estimate would be quietly wrong.
test('both legs of a cross-floor route use the same stairwell', () => {
  for (const fromFloor of FLOORS) {
    for (const toFloor of FLOORS) {
      if (fromFloor === toFloor) continue;
      for (const from of ROOM_LABELS[fromFloor]) {
        for (const to of ROOM_LABELS[toFloor]) {
          const r = findPath(from, fromFloor, to, toFloor);
          if (r.error) continue;
          const what = `${from} (F${fromFloor}) -> ${to} (F${toFloor})`;
          const landings = STAIR_POSITIONS[r.stairNum];
          assert.ok(landings, `${what}: unknown stair ${r.stairNum}`);
          assert.deepStrictEqual(r.path1.at(-1), landings[fromFloor],
            `${what}: leg 1 does not finish at stair ${r.stairNum}'s floor-${fromFloor} landing`);
          assert.deepStrictEqual(r.path2[0], landings[toFloor],
            `${what}: leg 2 does not start at stair ${r.stairNum}'s floor-${toFloor} landing`);
        }
      }
    }
  }
});
