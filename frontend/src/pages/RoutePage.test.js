import { describe, it, expect, beforeEach } from 'vitest';
import { estimateWalk, pathLengthPx, readRouteList, writeRouteList, displayName } from './RoutePage';

describe('displayName', () => {
  it('prefixes numbered rooms but not named places', () => {
    expect(displayName('184')).toBe('Room 184');
    expect(displayName('281/283')).toBe('Room 281/283');
    expect(displayName('Reception')).toBe('Reception');
    expect(displayName('GYM')).toBe('GYM');
    expect(displayName('Xchange/Library')).toBe('Xchange/Library');
  });
});

describe('pathLengthPx', () => {
  it('sums the segments of a path', () => {
    expect(pathLengthPx([[0, 0], [3, 4]])).toBe(5);
    expect(pathLengthPx([[0, 0], [3, 4], [3, 4 + 12]])).toBe(17);
  });

  it('is zero for anything that is not a drawable path', () => {
    for (const p of [null, undefined, [], [[0, 0]], 'nope', 42]) {
      expect(pathLengthPx(p)).toBe(0);
    }
  });
});

describe('estimateWalk', () => {
  const sameFloor = (path1) => ({ sameFloor: true, fromFloor: 1, toFloor: 1, path1, path2: null });

  it('reports a plausible distance and time for a real-length walk', () => {
    // 2448px is the full width of the plan, declared as ~140m.
    const walk = estimateWalk(sameFloor([[0, 0], [2448, 0]]));
    expect(walk.meters).toBe(140);
    expect(walk.minutes).toBe(2);   // 140m / 1.3 m/s = 108s
  });

  it('never reports zero minutes, even for a two-step walk', () => {
    const walk = estimateWalk(sameFloor([[0, 0], [1, 0]]));
    expect(walk.minutes).toBeGreaterThanOrEqual(1);
  });

  it('counts both legs of a cross-floor walk, not just the first', () => {
    const legs = { path1: [[0, 0], [2000, 0]], path2: [[0, 0], [2000, 0]] };
    const walk = estimateWalk({ sameFloor: false, fromFloor: 1, toFloor: 2, ...legs });
    expect(walk.meters).toBe(Math.round(4000 * (140 / 2448)));
  });

  it('adds stair time per floor changed', () => {
    // Path length chosen so the extra 25s for the second flight actually
    // crosses a minute boundary — the display rounds to whole minutes, so a
    // shorter walk would show the same number either way.
    const legs = { path1: [[0, 0], [2000, 0]], path2: [[0, 0], [2000, 0]] };
    const oneFloor = estimateWalk({ sameFloor: false, fromFloor: 1, toFloor: 2, ...legs });
    const twoFloors = estimateWalk({ sameFloor: false, fromFloor: 1, toFloor: 3, ...legs });
    expect(oneFloor.minutes).toBe(3);
    expect(twoFloors.minutes).toBe(4);
    expect(twoFloors.meters).toBe(oneFloor.meters);   // stairs add time, not distance
  });

  it('handles a same-room result (a path of one repeated point)', () => {
    const walk = estimateWalk(sameFloor([[100, 100], [100, 100]]));
    expect(walk.meters).toBe(0);
    expect(walk.minutes).toBe(1);
  });

  it('does not throw on a malformed result object', () => {
    expect(() => estimateWalk({ sameFloor: true })).not.toThrow();
    expect(estimateWalk({ sameFloor: true }).meters).toBe(0);
  });
});

describe('readRouteList / writeRouteList', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a list of routes', () => {
    const list = [{ fromFloor: 1, fromKey: '188', toFloor: 3, toKey: '331' }];
    writeRouteList('k', list);
    expect(readRouteList('k')).toEqual(list);
  });

  it('returns an empty list when nothing is stored', () => {
    expect(readRouteList('missing')).toEqual([]);
  });

  it('returns an empty list rather than crashing on corrupt JSON', () => {
    window.localStorage.setItem('k', '{not json');
    expect(readRouteList('k')).toEqual([]);
  });

  // A stored object or number would previously have reached .map() in render.
  it('returns an empty list when the stored value is not an array', () => {
    for (const junk of ['{"a":1}', '42', '"a string"', 'true']) {
      window.localStorage.setItem('k', junk);
      expect(readRouteList('k')).toEqual([]);
    }
  });

  it('drops entries that are not usable route records', () => {
    window.localStorage.setItem('k', JSON.stringify([
      { fromFloor: 1, fromKey: '188', toFloor: 3, toKey: '331' },  // keep
      { fromKey: '188' },                                          // no toKey
      null,
      'a string',
      42,
      {},
    ]));
    expect(readRouteList('k')).toEqual([
      { fromFloor: 1, fromKey: '188', toFloor: 3, toKey: '331' },
    ]);
  });
});
