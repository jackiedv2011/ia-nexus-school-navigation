'use strict';

// Guards against the two copies of the building's room list drifting apart.
//
// backend/data/roomCoordinates.js is the source of truth, but the Route
// Finder's picker keeps its own literal copy in
// frontend/src/pages/RoutePage.jsx because the frontend cannot import from the
// backend. Nothing enforced that they matched, so a room added to one and not
// the other would either be missing from the picker (invisible to students) or
// offered in the picker and then rejected as "no route" by the server.
//
// The frontend file is read as TEXT and its ROOMS literal parsed out, rather
// than imported — this is a CommonJS test runner and that file is an ES module
// full of JSX.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOM_LABELS, ROOM_DOORS } = require('../data/roomCoordinates');

const ROUTE_PAGE = path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'RoutePage.jsx');

// Pull `const ROOMS = { 1: [...], 2: [...], 3: [...] };` out of the JSX source.
function frontendRoomLists() {
  const src = fs.readFileSync(ROUTE_PAGE, 'utf8');
  const start = src.indexOf('const ROOMS = {');
  assert.ok(start !== -1, 'RoutePage.jsx no longer declares `const ROOMS = {` — update this test');
  const end = src.indexOf('\n};', start);
  assert.ok(end !== -1, 'could not find the end of the ROOMS literal');
  const body = src.slice(start + 'const ROOMS = '.length, end + 2);

  const lists = {};
  for (const floor of [1, 2, 3]) {
    const re = new RegExp(`\\b${floor}:\\s*\\[([\\s\\S]*?)\\]`);
    const m = body.match(re);
    assert.ok(m, `floor ${floor} is missing from RoutePage.jsx's ROOMS`);
    lists[floor] = [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
  }
  return lists;
}

test("the Route Finder's picker lists exactly the rooms the backend knows", () => {
  const frontend = frontendRoomLists();
  for (const floor of [1, 2, 3]) {
    const backend = ROOM_LABELS[floor];
    const missing = backend.filter(r => !frontend[floor].includes(r));
    const extra = frontend[floor].filter(r => !backend.includes(r));
    assert.deepStrictEqual(missing, [],
      `floor ${floor}: in ROOM_LABELS but not offered in the picker — students cannot select these`);
    assert.deepStrictEqual(extra, [],
      `floor ${floor}: offered in the picker but unknown to the backend — selecting these returns "no route"`);
    assert.deepStrictEqual(frontend[floor], backend,
      `floor ${floor}: same rooms, different order — keep the two lists identical`);
  }
});

// ROOM_LABELS drives the pickers; ROOM_DOORS drives the pathfinding. A label
// with no doorway is a room a student can select and never be routed to.
test('every room label has doorway coordinates, and every doorway has a label', () => {
  const labelKeys = new Set();
  for (const floor of [1, 2, 3]) {
    for (const label of ROOM_LABELS[floor]) {
      const key = `${floor}:${label.toLowerCase().replace(/\s+/g, '')}`;
      labelKeys.add(key);
      assert.ok(ROOM_DOORS[key], `${label} (floor ${floor}) is listed but has no doorway in ROOM_DOORS`);
    }
  }
  for (const key of Object.keys(ROOM_DOORS)) {
    assert.ok(labelKeys.has(key),
      `${key} has doorway coordinates but is not in ROOM_LABELS, so nothing can reach it`);
  }
});

test('every doorway coordinate is a finite, in-bounds pair', () => {
  // The blueprint space the whole project works in.
  const W = 2448, H = 1584;
  for (const [key, doors] of Object.entries(ROOM_DOORS)) {
    assert.ok(Array.isArray(doors) && doors.length > 0, `${key}: no doorways`);
    for (const d of doors) {
      assert.ok(Array.isArray(d) && d.length === 2, `${key}: doorway is not an [x, y] pair`);
      const [x, y] = d;
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${key}: non-numeric doorway ${JSON.stringify(d)}`);
      assert.ok(x >= 0 && x <= W && y >= 0 && y <= H,
        `${key}: doorway ${JSON.stringify(d)} is outside the ${W}x${H} blueprint`);
    }
    // A room listing the same doorway twice would make the router consider one
    // door as if it were two.
    const seen = new Set(doors.map(d => d.join(',')));
    assert.strictEqual(seen.size, doors.length, `${key}: duplicate doorway coordinates`);
  }
});

test('every stairwell landing is a finite, in-bounds pair on a real floor', () => {
  const { STAIR_POSITIONS } = require('../data/roomCoordinates');
  const W = 2448, H = 1584;
  for (const [id, landings] of Object.entries(STAIR_POSITIONS)) {
    assert.ok(/^\d+$/.test(id), `stair id "${id}" is not numeric`);
    const floors = Object.keys(landings);
    assert.ok(floors.length >= 2, `stair ${id} has ${floors.length} landing(s) — it connects nothing`);
    for (const [floor, pos] of Object.entries(landings)) {
      assert.ok(['1', '2', '3'].includes(floor), `stair ${id} has a landing on floor ${floor}`);
      assert.ok(Number.isFinite(pos[0]) && Number.isFinite(pos[1]), `stair ${id}.${floor}: non-numeric`);
      assert.ok(pos[0] >= 0 && pos[0] <= W && pos[1] >= 0 && pos[1] <= H,
        `stair ${id}.${floor} at ${JSON.stringify(pos)} is outside the blueprint`);
    }
  }
});

// The corridor table is the entire walkable network; a malformed segment
// silently removes a hallway.
test('every corridor segment is well-formed and in bounds', () => {
  const { CORRIDORS } = require('../data/roomCoordinates');
  const W = 2448, H = 1584;
  for (const [floor, c] of Object.entries(CORRIDORS)) {
    for (const h of c.horizontal) {
      assert.ok(Number.isFinite(h.y) && Number.isFinite(h.xMin) && Number.isFinite(h.xMax),
        `floor ${floor}: non-numeric horizontal segment ${JSON.stringify(h)}`);
      assert.ok(h.xMax > h.xMin, `floor ${floor}: horizontal segment ${JSON.stringify(h)} has zero or negative length`);
      assert.ok(h.y >= 0 && h.y <= H && h.xMin >= 0 && h.xMax <= W,
        `floor ${floor}: horizontal segment ${JSON.stringify(h)} is out of bounds`);
    }
    for (const v of c.vertical) {
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.yMin) && Number.isFinite(v.yMax),
        `floor ${floor}: non-numeric vertical segment ${JSON.stringify(v)}`);
      assert.ok(v.yMax > v.yMin, `floor ${floor}: vertical segment ${JSON.stringify(v)} has zero or negative length`);
      assert.ok(v.x >= 0 && v.x <= W && v.yMin >= 0 && v.yMax <= H,
        `floor ${floor}: vertical segment ${JSON.stringify(v)} is out of bounds`);
    }
  }
});

// The teacher roster feeds both chat engines and the directory. A malformed
// entry surfaces as a wrong answer, not an error.
test('every teacher record is well-formed', () => {
  const teachers = require('../data/teachers.json');
  assert.ok(Array.isArray(teachers) && teachers.length > 0);
  const ids = new Set();
  for (const t of teachers) {
    assert.ok(typeof t.id !== 'undefined', `a teacher has no id: ${JSON.stringify(t).slice(0, 80)}`);
    assert.ok(!ids.has(t.id), `duplicate teacher id ${t.id}`);
    ids.add(t.id);
    assert.ok(typeof t.name === 'string' && t.name.trim(), `teacher ${t.id} has no name`);
    assert.ok(Array.isArray(t.aliases) && t.aliases.length > 0, `${t.name} has no aliases`);
    for (const a of t.aliases) {
      assert.strictEqual(typeof a, 'string', `${t.name} has a non-string alias`);
      assert.strictEqual(a, a.toLowerCase(),
        `${t.name}: alias "${a}" is not lowercase — alias matching lowercases the question, so it can never match`);
    }
    assert.ok(t.schedule && typeof t.schedule === 'object', `${t.name} has no schedule`);
    for (const period of Object.keys(t.schedule)) {
      assert.ok(/^[1-8]$/.test(period), `${t.name} has a schedule entry for period "${period}"`);
      assert.strictEqual(typeof t.schedule[period], 'string', `${t.name} period ${period} is not a string`);
    }
  }
});
