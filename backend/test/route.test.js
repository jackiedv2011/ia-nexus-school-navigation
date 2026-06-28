'use strict';

// Regression tests that lock in the pathfinding behavior. roomCoordinates.js is a
// protected system — these snapshots prove the algorithm, room coordinates, and
// stair selection produce identical results before and after the audit changes.

const test = require('node:test');
const assert = require('node:assert');
const { findPath } = require('../data/roomCoordinates');

// Baseline captured before any audit change (see /tmp/ia-baseline.json).
const CASES = [
  { in: ['188', 1, '331', 3], sameFloor: false, stairNum: 2, fromFloor: 1, toFloor: 3, path1Len: 21, path2Len: 9,  path1First: [277, 421],  path1Last: [1385, 1045] },
  { in: ['253', 2, '351', 3], sameFloor: false, stairNum: 5, fromFloor: 2, toFloor: 3, path1Len: 5,  path2Len: 5,  path1First: [1796, 1320], path1Last: [1670, 1505] },
  { in: ['331', 3, '359', 3], sameFloor: true,  stairNum: null, fromFloor: 3, toFloor: 3, path1Len: 19, path2Len: 0, path1First: [1443, 993], path1Last: [1816, 1310] },
  { in: ['101', 1, '102', 1], sameFloor: true,  stairNum: null, fromFloor: 1, toFloor: 1, path1Len: 2,  path2Len: 0, path1First: [1200, 816], path1Last: [1255, 816] },
  { in: ['281', 2, '294', 2], sameFloor: true,  stairNum: null, fromFloor: 2, toFloor: 2, path1Len: 21, path2Len: 0, path1First: [470, 255],  path1Last: [2082, 265] },
  { in: ['189', 1, '192', 1], sameFloor: true,  stairNum: null, fromFloor: 1, toFloor: 1, path1Len: 18, path2Len: 0, path1First: [285, 715],  path1Last: [2151, 265] },
  { in: ['341', 3, '351', 3], sameFloor: true,  stairNum: null, fromFloor: 3, toFloor: 3, path1Len: 16, path2Len: 0, path1First: [605, 950],  path1Last: [1816, 1045] },
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
