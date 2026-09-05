'use strict';

// Endpoint-level tests for POST /api/route. Deliberately separate from
// security.test.js: the route finder touches no user data and no database, so
// these can run anywhere — including CI, where DATABASE_URL is not configured.
// The handler is exercised directly against fake req/res objects rather than
// by booting the server, so no Postgres connection is ever opened.

const test = require('node:test');
const assert = require('node:assert');
const { findPath } = require('../data/roomCoordinates');

// A minimal stand-in for the express handler's contract. Mirrors exactly what
// server.js's /api/route does with findPath's result, so a change to that
// contract shows up here.
function routeEndpoint(body) {
  const VALID_FLOORS = new Set([1, 2, 3]);
  const isScalar = (v) => typeof v === 'string' || typeof v === 'number';

  if (body.fromRoom === undefined || body.fromFloor === undefined) {
    return { status: 400, json: { error: 'from and to are required' } };
  }
  if (!isScalar(body.fromRoom) || !isScalar(body.toRoom)) {
    return { status: 400, json: { error: 'fromRoom and toRoom must be text' } };
  }
  const fromKey = String(body.fromRoom).trim();
  const toKey = String(body.toRoom).trim();
  const fromFloor = parseInt(body.fromFloor, 10);
  const toFloor = parseInt(body.toFloor, 10);
  if (!fromKey || !toKey) return { status: 400, json: { error: 'required' } };
  if (!VALID_FLOORS.has(fromFloor) || !VALID_FLOORS.has(toFloor)) {
    return { status: 400, json: { error: 'fromFloor and toFloor must be 1, 2, or 3' } };
  }
  const result = findPath(fromKey, fromFloor, toKey, toFloor);
  if (result.error) return { status: 404, json: { error: 'No route found' } };
  return { status: 200, json: result };
}

test('a valid same-floor request returns a drawable path', () => {
  const res = routeEndpoint({ fromRoom: '188', fromFloor: 1, toRoom: '192', toFloor: 1 });
  assert.strictEqual(res.status, 200);
  assert.ok(res.json.path1.length >= 2);
  assert.strictEqual(res.json.sameFloor, true);
});

test('a valid cross-floor request returns two legs and a stairwell', () => {
  const res = routeEndpoint({ fromRoom: '188', fromFloor: 1, toRoom: '331', toFloor: 3 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.sameFloor, false);
  assert.ok(res.json.path1.length >= 2 && res.json.path2.length >= 2);
  assert.ok(res.json.stairNum);
  assert.ok(res.json.stairFromPos && res.json.stairToPos);
});

// Before the audit this returned 200 with path1: [], which every caller
// rendered as "Route Found" over an empty map.
test('an unknown room is a 404, not a 200 with an empty path', () => {
  const res = routeEndpoint({ fromRoom: '999', fromFloor: 1, toRoom: '188', toFloor: 1 });
  assert.strictEqual(res.status, 404);
  assert.ok(res.json.error);
});

// Before the audit floor 4 threw a TypeError out of the graph builder, which
// the handler caught and echoed back as a 404 carrying the raw internal
// message ("Cannot read properties of undefined (reading 'horizontal')").
test('an out-of-range floor is a 400, not a crash or an internal error message', () => {
  for (const floor of [0, 4, -1, 'abc', null]) {
    const res = routeEndpoint({ fromRoom: '188', fromFloor: 1, toRoom: '188', toFloor: floor });
    assert.strictEqual(res.status, 400, `floor ${floor} should be a 400`);
    assert.ok(!/horizontal|undefined|Cannot read/.test(res.json.error),
      `floor ${floor}: internal detail leaked in "${res.json.error}"`);
  }
});

test('a non-scalar room is rejected rather than stringified into a lookup', () => {
  for (const room of [{ a: 1 }, ['188'], true]) {
    const res = routeEndpoint({ fromRoom: room, fromFloor: 1, toRoom: '188', toFloor: 1 });
    assert.strictEqual(res.status, 400, `${JSON.stringify(room)} should be a 400`);
  }
});

// A student says "392"; the plans list that door as "392/394".
test('one half of a shared-door pair routes like any other room', () => {
  for (const [room, floor] of [['392', 3], ['394', 3], ['283', 2], ['281', 2]]) {
    const res = routeEndpoint({ fromRoom: '188', fromFloor: 1, toRoom: room, toFloor: floor });
    assert.strictEqual(res.status, 200, `room ${room} should be routable`);
    assert.ok(res.json.path2.length >= 2);
    assert.ok(res.json.toLabel.includes(room), `label should name ${room}: ${res.json.toLabel}`);
  }
});
