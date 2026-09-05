'use strict';

// ─── COORDINATE SPACE ─────────────────────────────────────────────────────────
// Every coordinate in this file is in the blueprint pixel space (2448x1584) the
// project has always used. The published floor plans are a redrawn, simplified
// version of those blueprints at a different scale and crop; the frontend
// (NavigationMap.jsx) carries the per-floor transform that maps this space onto
// each image, so the drawings can be replaced without touching any of the
// numbers here.
//
// Corridors, room doors and the room list below were derived from the school's
// marked-up floor plans (red = the only walkable hallways, green = doorways,
// yellow = the rooms that exist). The hand-drawn hallways wobble; they are
// recorded here as perfectly straight axis-aligned segments.

// ─── STAIRWELL POSITIONS ──────────────────────────────────────────────────────
// STAIR_POSITIONS[stairId][floor] = [x, y]
//
// Stairs 4-8 run the full height of the building. Stair 2, stair 3, and the
// main staircase by the Xchange/Library serve floors 2-3 only — there is no
// floor-1 landing for any of them, so they are skipped when a route touches
// floor 1.
//
// Every coordinate here is the actual physical stairwell location — either the
// centroid of the school's hand-drawn black mark, or (floor 1's 172/174 icon
// and floor 3's 8) the combined centroid of that mark split across two ink
// blobs by a gap in the pen stroke. These are NOT pre-projected onto a
// hallway: buildFloorGraph below treats every entry here exactly like a room
// doorway (see ROOM_DOORS) — it perpendicularly projects the point onto the
// nearest corridor and adds a short connecting stub. That is deliberate: it is
// the same mechanism already proven correct for ~80 room doors, so a stairwell
// gets the same clean, real hallway-relative walk instead of a hand-tuned
// special case. Every resulting stub here measures 2-9m, in line with typical
// room-door stubs elsewhere in the building.
//
// Confirmed floor-by-floor against the school's black marks:
//  - Floors 2 and 3: all eight numbered stairs plus both landings of the new
//    main staircase (see stair 1 below) were matched to a distinct ink blob,
//    each within 23-140px of this file's previous (blueprint-label-derived)
//    estimate — strong confirmation the IDs are matched correctly floor to
//    floor.
//  - Floor 1: stairs 5, 6, 7 and 8 each have their own confirmed mark. Stair 4
//    was initially missed (its icon sits in a tight corner near rooms
//    147/144, easy to mistake for wall corner ink) but was located on a
//    second pass and confirmed against the school's stated path — floor 1
//    near 147/144 -> floor 2 near 246/249 -> floor 3 near 346/349, which lines
//    up with stair 4's already-confirmed floor-2/3 landings next to those
//    exact rooms. Stair 2 was searched for at its expected position (and well
//    beyond it) and found to have no mark and no architectural stair icon at
//    all — so floor 1 has no landing for it, and it is omitted below rather
//    than kept at a guessed position a student could be routed to
//    incorrectly. findPath already skips any stair missing a landing on
//    either end of a trip, the same way it already does for stairs 1 and 3
//    (see UPPER_FLOOR_ONLY_STAIRS) — so this needs no other code change.
const STAIR_POSITIONS = {
  4: { 1: [1309, 1266], 2: [719, 1460],  3: [723, 1496]  },
  5: { 1: [2093, 1255], 2: [1686, 1457], 3: [1695, 1500] },
  6: { 1: [1514, 628],  2: [607, 188],   3: [623, 206]   },
  7: { 1: [1735, 233],  2: [1272, 166],  3: [1287, 196]  },
  8: { 1: [2147, 222],  2: [1790, 178],  3: [1797, 198]  },
  2: { 2: [801, 1023],  3: [822, 1060]  }, // no landing on floor 1
  3: { 2: [1598, 1030], 3: [1619, 1051] }, // floors 2-3 only
  // The main staircase beside the Xchange/Library. Floor 2's mark sits west of
  // the library, floor 3's east of it — about 290px (16m) apart — so each
  // floor keeps its own mark rather than being averaged into one shaft that
  // would match neither.
  1: { 2: [1073, 666],  3: [1361, 673]  }, // floors 2-3 only
};

// Stairwells that have no landing on floor 1, so a route to or from floor 1
// must not consider them.
const UPPER_FLOOR_ONLY_STAIRS = new Set([1, 2, 3]);

// ─── CORRIDOR DEFINITIONS ─────────────────────────────────────────────────────
// The red hallways from the marked-up plans, and nothing else — these are the
// only routes through the building. Horizontal segments are a fixed y over an
// x range; vertical segments a fixed x over a y range.

const CORRIDORS = {
  1: {
    horizontal: [
      { y:  319, xMin: 1668, xMax: 2161 },
      { y:  462, xMin:  289, xMax: 1135 },
      { y:  496, xMin: 1136, xMax: 2171 },
      { y:  644, xMin: 1193, xMax: 1473 },
      { y:  670, xMin: 1474, xMax: 2171 },
      { y:  700, xMin:  297, xMax: 1192 },
      { y:  835, xMin: 1199, xMax: 1684 },
      { y:  896, xMin: 1668, xMax: 1737 },
    ],
    vertical: [
      { x:  283, yMin:  457, yMax:  696 },
      { x: 1131, yMin:  453, yMax:  699 },
      { x: 1193, yMin:  641, yMax: 1225 },
      { x: 1466, yMin:  487, yMax:  670 },
      { x: 1678, yMin:  329, yMax:  979 },
      { x: 2166, yMin:  312, yMax: 1247 },
    ],
  },
  2: {
    horizontal: [
      { y:  294, xMin:  327, xMax: 2089 },
      { y:  512, xMin: 1194, xMax: 1577 },
      { y:  713, xMin: 1140, xMax: 1586 },
      { y:  826, xMin:  839, xMax:  907 },
      { y:  922, xMin:  589, xMax: 1827 },
    ],
    vertical: [
      { x:  594, yMin:  292, yMax: 1466 },
      { x: 1133, yMin:  632, yMax:  721 },
      { x: 1201, yMin:  287, yMax:  925 },
      { x: 1579, yMin:  499, yMax:  726 },
      { x: 1814, yMin:  284, yMax: 1467 },
    ],
  },
  3: {
    horizontal: [
      { y:  319, xMin:  316, xMax: 2081 },
      { y:  536, xMin:  949, xMax: 1216 },
      { y:  714, xMin:  946, xMax: 1212 },
      { y:  956, xMin:  593, xMax: 1837 },
    ],
    vertical: [
      { x:  600, yMin:  309, yMax: 1500 },
      { x:  949, yMin:  538, yMax:  715 },
      { x: 1209, yMin:  310, yMax:  965 },
      { x: 1835, yMin:  325, yMax: 1511 },
    ],
  },
};

// ─── ROOM DOORS ───────────────────────────────────────────────────────────────
// ROOM_DOORS['floor:roomkey'] = [[x, y], ...] — every doorway the plans mark for
// that room. A route starts and ends AT a doorway, and where a room has more
// than one the router picks whichever pair makes the walk shortest.
//
// Two neighbours may list the same point: that is a single doorway drawn on the
// wall they share. The open areas (the hangars, the GYM, the Xchange/Library)
// have no drawn doorway because they have no door — their point is where the
// hallway network passes them.

const ROOM_DOORS = {
  // ── FLOOR 1 ──────────────────────────────────────────────────────────
  '1:116':                 [[1647, 259]],
  '1:121':                 [[1503, 859]],
  '1:123':                 [[1398, 852]],
  '1:144':                 [[1222, 951]],
  '1:147':                 [[1160, 993], [1164, 1200]],
  '1:157':                 [[2139, 1076], [2196, 1208]],
  '1:172':                 [[1865, 294]],
  '1:174':                 [[1903, 294]],
  '1:181':                 [[686, 728]],
  '1:184':                 [[482, 433], [671, 425]],
  '1:188':                 [[284, 431]],
  '1:189':                 [[283, 727]],
  '1:191':                 [[2196, 349]],
  '1:192':                 [[2205, 292]],
  '1:clinic':              [[1782, 683]],
  '1:courtyard':           [[1087, 581]],
  '1:gym':                 [[2166, 1024]],
  '1:hangareast':          [[1952, 496]],
  '1:hangarwest':          [[1295, 496]],
  '1:missioncontrol':      [[1512, 693]],
  '1:reception':           [[1752, 832], [1749, 892]],

  // ── FLOOR 2 ──────────────────────────────────────────────────────────
  '2:223':                 [[965, 961]],
  '2:233':                 [[1413, 956]],
  '2:235':                 [[1446, 956], [1592, 961]],
  '2:236':                 [[1527, 891], [1774, 889]],
  '2:242':                 [[628, 1031]],
  '2:244':                 [[629, 1285], [564, 1145]],
  '2:246':                 [[628, 1322], [624, 1459]],
  '2:249':                 [[563, 1406]],
  '2:251':                 [[1785, 1161]],
  '2:252':                 [[1845, 895]],
  '2:253':                 [[1787, 1226]],
  '2:258':                 [[1842, 1309]],
  '2:261':                 [[1265, 256]],
  '2:262':                 [[1133, 333]],
  '2:263':                 [[1100, 252]],
  '2:265':                 [[961, 258]],
  '2:267':                 [[711, 259]],
  '2:268':                 [[736, 332]],
  '2:272':                 [[1464, 256]],
  '2:273':                 [[1411, 337]],
  '2:274':                 [[1464, 256]],
  '2:275':                 [[1455, 331]],
  '2:277':                 [[1587, 330]],
  '2:281/283':             [[544, 262]],
  '2:282/284':             [[548, 334]],
  '2:291/293':             [[1857, 331]],
  '2:292/294':             [[1882, 257], [1824, 253]],
  '2:biotechlab':          [[964, 898]],
  '2:xchange/library':     [[1201, 592]],

  // ── FLOOR 3 ──────────────────────────────────────────────────────────
  '3:301':                 [[1263, 990]],
  '3:322':                 [[948, 920]],
  '3:324':                 [[913, 916]],
  '3:331':                 [[1428, 985]],
  '3:332':                 [[1425, 919]],
  '3:333':                 [[1466, 987]],
  '3:334':                 [[1463, 915]],
  '3:342':                 [[634, 1003]],
  '3:345':                 [[567, 1228]],
  '3:346':                 [[632, 1240]],
  '3:349':                 [[569, 1312]],
  '3:351':                 [[1798, 1010], [1798, 1227]],
  '3:354':                 [[1866, 1078], [1867, 814]],
  '3:356':                 [[1866, 1283], [1866, 1492]],
  '3:359':                 [[1805, 1284], [1801, 1449]],
  '3:362':                 [[1149, 354], [922, 355]],
  '3:363':                 [[1232, 274], [951, 279]],
  '3:364':                 [[657, 344], [879, 349]],
  '3:367':                 [[683, 279], [907, 278]],
  '3:372':                 [[1366, 277], [1597, 279]],
  '3:373':                 [[1277, 345]],
  '3:375':                 [[1568, 355]],
  '3:377':                 [[1608, 356]],
  '3:381/383':             [[553, 278]],
  '3:382/384':             [[556, 349]],
  '3:391/393':             [[2006, 349], [1878, 351]],
  '3:392/394':             [[2032, 282], [1875, 279]],
  '3:xchange/library':     [[1209, 617]],
};

// ─── ROOM LABELS ──────────────────────────────────────────────────────────────
// Exactly the rooms the school lists for each floor, in the form they should be
// shown to a student. ROOM_LABELS drives the route finder's pickers, and the
// keys derived from it are what ROOM_DOORS is looked up by.

const ROOM_LABELS = {
  1: ['116', '121', '123', '144', '147', '157', '172', '174', '181', '184',
      '188', '189', '191', '192', 'Clinic', 'Courtyard', 'GYM', 'Hangar East',
      'Hangar West', 'Mission Control', 'Reception'],
  2: ['223', '233', '235', '236', '242', '244', '246', '249', '251', '252',
      '253', '258', '261', '262', '263', '265', '267', '268', '272', '273',
      '274', '275', '277', '281/283', '282/284', '291/293', '292/294',
      'BioTech Lab', 'Xchange/Library'],
  3: ['301', '322', '324', '331', '332', '333', '334', '342', '345', '346',
      '349', '351', '354', '356', '359', '362', '363', '364', '367', '372',
      '373', '375', '377', '381/383', '382/384', '391/393', '392/394',
      'Xchange/Library'],
};

// ─── GRAPH BUILDER ────────────────────────────────────────────────────────────

// Corridor extents are measured off a hand drawing, so a junction that is
// physically a T or a cross can be recorded a few pixels short of touching. A
// strict containment test then silently drops that junction and the router
// detours around it. Snapping junctions that are within this many pixels of
// meeting fixes the whole class of bug without hand-editing each number. Kept
// well below the distance between any two distinct corridors, so it cannot
// invent a junction that isn't physically there.
const JUNCTION_TOL = 30;

function buildFloorGraph(floor) {
  const corrs = CORRIDORS[floor];
  const nodes = {}; // "x,y" -> { id, x, y }
  const edges = {}; // "x,y" -> [{ to, dist }]

  function nodeId(x, y) {
    const key = `${x},${y}`;
    if (!nodes[key]) {
      nodes[key] = { id: key, x, y };
      edges[key] = [];
    }
    return key;
  }

  function addEdge(a, b) {
    if (a === b) return;
    const na = nodes[a], nb = nodes[b];
    const dist = Math.hypot(nb.x - na.x, nb.y - na.y);
    if (!edges[a].some(e => e.to === b)) edges[a].push({ to: b, dist });
    if (!edges[b].some(e => e.to === a)) edges[b].push({ to: a, dist });
  }

  // ── Attachment points: every doorway and stairwell on this floor ───────────
  // Each has to meet the hallway network somewhere. Every point is projected
  // PERPENDICULARLY onto the nearest corridor, so the stub joining it to the
  // network is a clean right-angle walk out of the doorway rather than a
  // diagonal cutting across whatever lies between.
  const attachPoints = [];
  for (const [key, doors] of Object.entries(ROOM_DOORS)) {
    if (parseInt(key.split(':')[0], 10) !== floor) continue;
    for (const d of doors) attachPoints.push(d);
  }
  for (const floors of Object.values(STAIR_POSITIONS)) {
    if (floors[floor]) attachPoints.push(floors[floor]);
  }

  // Foot of the perpendicular from a point to the nearest corridor, clamped to
  // that corridor's own extent so it can never land off the end of it.
  //
  // A foot that did NOT need clamping is preferred: it lies straight across
  // from the door, so the stub is a single straight walk, whereas a clamped
  // foot sits past the end of the corridor and needs an elbow. That preference
  // is a fixed penalty rather than an absolute rule, so a clamped foot still
  // wins when it is dramatically closer — which is the right answer for a
  // stairwell tucked past the end of the corridor that serves it.
  const CLAMP_PENALTY = 60;

  function projectOntoNearestCorridor([px, py]) {
    let best = null, bestScore = Infinity;
    const consider = (cand, clamped, d) => {
      const score = d + (clamped ? CLAMP_PENALTY : 0);
      if (score < bestScore) { bestScore = score; best = cand; }
    };
    for (const hc of corrs.horizontal) {
      const fx = Math.min(Math.max(px, hc.xMin), hc.xMax);
      consider({ x: fx, y: hc.y, corr: hc, axis: 'h' }, fx !== px, Math.hypot(fx - px, hc.y - py));
    }
    for (const vc of corrs.vertical) {
      const fy = Math.min(Math.max(py, vc.yMin), vc.yMax);
      consider({ x: vc.x, y: fy, corr: vc, axis: 'v' }, fy !== py, Math.hypot(vc.x - px, fy - py));
    }
    return best;
  }

  const attachments = attachPoints.map(pt => ({ pt, foot: projectOntoNearestCorridor(pt) }));

  // Horizontal corridors: gather every point that sits on one, sort by x, and
  // chain them together.
  for (const hc of corrs.horizontal) {
    const pts = new Map();
    pts.set(hc.xMin, hc.y);
    pts.set(hc.xMax, hc.y);
    for (const vc of corrs.vertical) {
      if (vc.x >= hc.xMin - JUNCTION_TOL && vc.x <= hc.xMax + JUNCTION_TOL &&
          hc.y >= vc.yMin - JUNCTION_TOL && hc.y <= vc.yMax + JUNCTION_TOL) {
        pts.set(vc.x, hc.y);
      }
    }
    for (const a of attachments) {
      if (a.foot.axis === 'h' && a.foot.corr === hc) pts.set(a.foot.x, hc.y);
    }
    const sorted = Array.from(pts.entries()).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length - 1; i++) {
      addEdge(nodeId(sorted[i][0], sorted[i][1]), nodeId(sorted[i + 1][0], sorted[i + 1][1]));
    }
  }

  // Vertical corridors: same, sorted by y. The junction node created here is
  // identical to the one the horizontal pass creates, so two crossing corridors
  // genuinely share a node rather than passing through each other.
  for (const vc of corrs.vertical) {
    const pts = new Map();
    pts.set(vc.yMin, vc.x);
    pts.set(vc.yMax, vc.x);
    for (const hc of corrs.horizontal) {
      if (hc.y >= vc.yMin - JUNCTION_TOL && hc.y <= vc.yMax + JUNCTION_TOL &&
          vc.x >= hc.xMin - JUNCTION_TOL && vc.x <= hc.xMax + JUNCTION_TOL) {
        pts.set(hc.y, vc.x);
      }
    }
    for (const a of attachments) {
      if (a.foot.axis === 'v' && a.foot.corr === vc) pts.set(a.foot.y, vc.x);
    }
    const sorted = Array.from(pts.entries()).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length - 1; i++) {
      addEdge(nodeId(sorted[i][1], sorted[i][0]), nodeId(sorted[i + 1][1], sorted[i + 1][0]));
    }
  }

  // Join each doorway / stairwell to its foot on the corridor. Normally that is
  // a single straight stub. If the foot had to be clamped to a corridor's end
  // the two differ on both axes, so an elbow keeps the walk at right angles.
  for (const { pt, foot } of attachments) {
    const pKey = nodeId(pt[0], pt[1]);
    const fKey = nodeId(foot.x, foot.y);
    if (pt[0] === foot.x || pt[1] === foot.y) {
      addEdge(pKey, fKey);
    } else {
      const elbow = foot.axis === 'h' ? nodeId(pt[0], foot.y) : nodeId(foot.x, pt[1]);
      addEdge(pKey, elbow);
      addEdge(elbow, fKey);
    }
  }

  return { nodes, edges };
}

// ─── Graph cache ──────────────────────────────────────────────────────────────

const GRAPHS = {};
function getGraph(floor) {
  if (!GRAPHS[floor]) GRAPHS[floor] = buildFloorGraph(floor);
  return GRAPHS[floor];
}

for (const f of [1, 2, 3]) getGraph(f);

// ─── Dijkstra ─────────────────────────────────────────────────────────────────

function dijkstra(graph, startKey, endKey) {
  const { nodes, edges } = graph;
  if (!nodes[startKey] || !nodes[endKey]) return null;

  const dist = {};
  const prev = {};
  const visited = new Set();

  for (const k of Object.keys(nodes)) dist[k] = Infinity;
  dist[startKey] = 0;

  const queue = [startKey];

  while (queue.length > 0) {
    queue.sort((a, b) => dist[a] - dist[b]);
    const curr = queue.shift();
    if (visited.has(curr)) continue;
    visited.add(curr);
    if (curr === endKey) break;

    for (const { to, dist: d } of (edges[curr] || [])) {
      if (visited.has(to)) continue;
      const newDist = dist[curr] + d;
      if (newDist < (dist[to] ?? Infinity)) {
        dist[to] = newDist;
        prev[to] = curr;
        if (!queue.includes(to)) queue.push(to);
      }
    }
  }

  if (dist[endKey] === Infinity) return null;

  const path = [];
  let curr = endKey;
  while (curr !== undefined) {
    const n = nodes[curr];
    path.unshift([n.x, n.y]);
    curr = prev[curr];
  }
  return { path, cost: dist[endKey] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoomKey(roomStr, floor) {
  return `${floor}:${String(roomStr).toLowerCase().replace(/\s+/g, '')}`;
}

// Rooms that share one doorway are listed under a combined key ("3:392/394"),
// but a student says "392", and the chatbot's room parser only ever pulls out
// one three-digit number. Without this, asking the Route Finder for room 392
// came back "no route" for a room that plainly exists and that the chatbot had
// just given directions to. Map each half of a pair onto the combined key.
const PAIR_ALIASES = {};
for (const key of Object.keys(ROOM_DOORS)) {
  const [floor, name] = key.split(':');
  if (!name.includes('/')) continue;
  for (const half of name.split('/')) {
    const alias = `${floor}:${half.trim()}`;
    // Never let an alias shadow a room that exists under that name in its own
    // right — an explicit entry always wins.
    if (!ROOM_DOORS[alias]) PAIR_ALIASES[alias] = key;
  }
}

// The canonical ROOM_DOORS key for a room, following a shared-door alias when
// the caller named one half of a pair. Returns null if the room is unknown.
function canonicalRoomKey(roomStr, floor) {
  const key = getRoomKey(roomStr, floor);
  if (ROOM_DOORS[key]) return key;
  return PAIR_ALIASES[key] || null;
}

function getRoomDoors(roomStr, floor) {
  const key = canonicalRoomKey(roomStr, floor);
  return key ? ROOM_DOORS[key] : null;
}

function getStairKey(stairNum, floor) {
  const pos = STAIR_POSITIONS[stairNum]?.[floor];
  if (!pos) return null;
  return `${pos[0]},${pos[1]}`;
}

// ─── Per-query working copy ───────────────────────────────────────────────────
// A query needs to add nodes to the graph (the room terminals below), but the
// three floor graphs are built once and shared by every request. Writing into
// them directly meant every route permanently grew the cached graph, so what
// FLOOR_GRAPHS contained depended on what had been routed earlier in the
// process — and every later Dijkstra paid to initialise distances over the
// leftovers.
//
// An overlay is a shallow copy: the node and edge maps are new objects, but the
// edge ARRAYS are still shared with the base graph until something writes to
// one, at which point edgesFor clones just that array. Copying ~120 map entries
// per query is far cheaper than copying every adjacency list, and the base
// graph is never touched.
function overlayGraph(base) {
  return { nodes: { ...base.nodes }, edges: { ...base.edges }, owned: new Set() };
}

// The mutable adjacency list for `key`, cloned out of the base graph on first
// write. On a base graph (no `owned` set) it returns the real array.
function edgesFor(graph, key) {
  if (!graph.owned) {
    if (!graph.edges[key]) graph.edges[key] = [];
    return graph.edges[key];
  }
  if (!graph.owned.has(key)) {
    graph.edges[key] = (graph.edges[key] || []).slice();
    graph.owned.add(key);
  }
  return graph.edges[key];
}

// Attaches a point to the graph if the pre-built network doesn't already carry
// it, wiring it to the nearest existing node.
function ensurePointInGraph(graph, [x, y]) {
  const nodeKey = `${x},${y}`;
  if (graph.nodes[nodeKey]) return nodeKey;

  graph.nodes[nodeKey] = { id: nodeKey, x, y };

  let best = null, bestDist = Infinity;
  for (const [k, n] of Object.entries(graph.nodes)) {
    if (k === nodeKey) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  if (best) {
    edgesFor(graph, nodeKey).push({ to: best, dist: bestDist });
    edgesFor(graph, best).push({ to: nodeKey, dist: bestDist });
  } else {
    edgesFor(graph, nodeKey);
  }
  return nodeKey;
}

// A room with several doorways gets a temporary "terminal" node joined to each
// of its doors at zero cost. Dijkstra then runs once and comes back with the
// cheapest door on each end, instead of the caller having to try every pairing.
// The terminal is stripped off the path afterwards, so what the map draws still
// begins and ends exactly at a doorway.
//
// The terminal must be ONE-WAY, which is why there are two of them per room.
// A two-way zero-cost hub would let any passer-by walk in one of the room's
// doors and out of the other for free — routes on floor 3 really did start
// teleporting from one end of room 345 to the other. The exit terminal has
// outgoing edges only (nothing can walk into it) and the entry terminal has
// incoming edges only (nothing can walk back out), so neither can ever appear
// in the middle of somebody else's shortest path.
//
// `dir` is 'out' for the start of a route, 'in' for the destination.
function addRoomTerminal(graph, roomStr, floor, dir) {
  const doors = getRoomDoors(roomStr, floor);
  if (!doors || doors.length === 0) return null;

  // Keyed by the CANONICAL room key so "392" and "392/394" share one terminal
  // rather than accumulating two identical ones for the same set of doors.
  const termKey = `room:${dir}:${canonicalRoomKey(roomStr, floor)}`;
  const doorKeys = doors.map(d => ensurePointInGraph(graph, d));

  if (!graph.nodes[termKey]) {
    // The terminal sits on the room's first door so that anything reading its
    // coordinates gets a sensible position rather than (0,0).
    graph.nodes[termKey] = { id: termKey, x: doors[0][0], y: doors[0][1] };
  }
  const termEdges = edgesFor(graph, termKey);
  for (const dk of doorKeys) {
    if (dir === 'out') {
      if (!termEdges.some(e => e.to === dk)) termEdges.push({ to: dk, dist: 0 });
    } else {
      const doorEdges = edgesFor(graph, dk);
      if (!doorEdges.some(e => e.to === termKey)) doorEdges.push({ to: termKey, dist: 0 });
    }
  }
  return termKey;
}

function ensureStairInGraph(graph, stairNum, floor) {
  const pos = STAIR_POSITIONS[stairNum]?.[floor];
  if (!pos) return null;
  return ensurePointInGraph(graph, pos);
}

// Drops the zero-length hop into/out of a room terminal, leaving a path that
// starts at one doorway and finishes at the other.
function trimTerminals(path, trimStart, trimEnd) {
  if (!path) return [];
  let out = path;
  if (trimStart && out.length > 1) out = out.slice(1);
  if (trimEnd && out.length > 1) out = out.slice(0, -1);
  // Rooms 272 and 274 share the single doorway drawn on the wall between them,
  // so the walk from one to the other collapses to a point. Return it twice:
  // the map draws a start and an end marker, and a one-point path would fail
  // its "at least two points" guard and render nothing at all.
  if (out.length === 1) out = [out[0], out[0]];
  return out;
}

// ─── findPath ─────────────────────────────────────────────────────────────────

const FLOORS = [1, 2, 3];

function findPath(fromRoom, fromFloor, toRoom, toFloor) {
  fromFloor = parseInt(fromFloor, 10);
  toFloor   = parseInt(toFloor,   10);

  // The building has exactly three floors. Anything else has no corridor data,
  // and reaching buildFloorGraph with it throws a raw TypeError that callers
  // then surface to the user as an internal error message. Refuse it here, in
  // the same shape as every other "no route" answer, so every caller — the API
  // route, the rule engine, the tests — handles it the way it already handles
  // an unroutable request.
  if (!FLOORS.includes(fromFloor) || !FLOORS.includes(toFloor)) {
    return {
      error: 'Unknown floor', sameFloor: fromFloor === toFloor,
      fromFloor, toFloor,
      fromLabel: String(fromRoom), toLabel: String(toRoom),
      path1: [], path2: [], stairNum: null, stairFromPos: null, stairToPos: null,
    };
  }

  const fromLabel = labelFor(fromRoom, fromFloor);
  const toLabel   = labelFor(toRoom,   toFloor);

  // ── Same floor ────────────────────────────────────────────────────────────
  if (fromFloor === toFloor) {
    const graph = overlayGraph(getGraph(fromFloor));
    const startKey = addRoomTerminal(graph, fromRoom, fromFloor, 'out');
    const endKey   = addRoomTerminal(graph, toRoom,   toFloor, 'in');

    if (!startKey || !endKey) {
      return { error: 'Room not found', sameFloor: true, path1: [], fromFloor, toFloor, fromLabel, toLabel };
    }

    const result = dijkstra(graph, startKey, endKey);
    // A null result means the two doorways are in disconnected pieces of the
    // hallway network. Without this the caller gets a 200 "route found" with an
    // empty path, and the UI draws a blank map under a "Route Found" heading.
    if (!result) {
      return {
        error: 'No path found', sameFloor: true, fromFloor, toFloor, fromLabel, toLabel,
        path1: [], path2: null, stairNum: null, stairFromPos: null, stairToPos: null,
      };
    }
    return {
      sameFloor:    true,
      fromFloor,
      toFloor,
      fromLabel,
      toLabel,
      path1:        trimTerminals(result.path, true, true),
      path2:        null,
      stairNum:     null,
      stairFromPos: null,
      stairToPos:   null,
    };
  }

  // ── Different floors ──────────────────────────────────────────────────────
  // Stair 1 (the main staircase) and stair 3 have no floor-1 landing, so they
  // are only candidates when the trip stays between floors 2 and 3.
  const touchesFloor1 = fromFloor === 1 || toFloor === 1;
  const accessibleStairs = Object.keys(STAIR_POSITIONS)
    .map(Number)
    .filter(id => !(touchesFloor1 && UPPER_FLOOR_ONLY_STAIRS.has(id)))
    .sort((a, b) => a - b);

  const graphFrom = overlayGraph(getGraph(fromFloor));
  const graphTo   = overlayGraph(getGraph(toFloor));

  const startKey = addRoomTerminal(graphFrom, fromRoom, fromFloor, 'out');
  const endKey   = addRoomTerminal(graphTo,   toRoom,   toFloor, 'in');

  let best = null, bestCost = Infinity, bestStair = null;

  if (startKey && endKey) {
    for (const stairNum of accessibleStairs) {
      if (!STAIR_POSITIONS[stairNum]?.[fromFloor] || !STAIR_POSITIONS[stairNum]?.[toFloor]) continue;

      const stairFromKey = ensureStairInGraph(graphFrom, stairNum, fromFloor);
      const stairToKey   = ensureStairInGraph(graphTo,   stairNum, toFloor);
      if (!stairFromKey || !stairToKey) continue;

      const leg1 = dijkstra(graphFrom, startKey, stairFromKey);
      if (!leg1) continue;
      const leg2 = dijkstra(graphTo, stairToKey, endKey);
      if (!leg2) continue;

      const totalCost = leg1.cost + leg2.cost;
      if (totalCost < bestCost) {
        bestCost  = totalCost;
        bestStair = stairNum;
        best      = { leg1, leg2 };
      }
    }
  }

  if (!best) {
    return {
      error:        'No path found',
      sameFloor:    false,
      fromFloor, toFloor, fromLabel, toLabel,
      path1: [], path2: [], stairNum: null, stairFromPos: null, stairToPos: null,
    };
  }

  return {
    sameFloor:    false,
    fromFloor,
    toFloor,
    fromLabel,
    toLabel,
    path1:        trimTerminals(best.leg1.path, true, false),
    path2:        trimTerminals(best.leg2.path, false, true),
    stairNum:     bestStair,
    stairFromPos: STAIR_POSITIONS[bestStair][fromFloor],
    stairToPos:   STAIR_POSITIONS[bestStair][toFloor],
  };
}

// ─── Labels and lookup ────────────────────────────────────────────────────────

// Index of normalized key -> the label as the school writes it, so a route can
// say "Reception" or "281/283" rather than echoing back whatever the caller
// typed.
const LABEL_BY_KEY = {};
for (const [floor, labels] of Object.entries(ROOM_LABELS)) {
  for (const label of labels) {
    LABEL_BY_KEY[getRoomKey(label, floor)] = label;
  }
}

function labelFor(roomStr, floor) {
  // canonicalRoomKey follows a shared-door alias, so asking for "392" is
  // labelled with the school's own "392/394" rather than echoing the half back.
  const known = LABEL_BY_KEY[canonicalRoomKey(roomStr, floor) || getRoomKey(roomStr, floor)];
  if (!known) return String(roomStr);
  return /^\d/.test(known) ? `Room ${known}` : known;
}

function getFloorFromRoom(roomStr) {
  const num = parseInt(roomStr, 10);
  if (!isNaN(num)) {
    if (num >= 100 && num <= 199) return 1;
    if (num >= 200 && num <= 299) return 2;
    if (num >= 300 && num <= 399) return 3;
  }
  return null;
}

function resolveRoom(label) {
  const floorMatch = label.match(/Floor\s*(\d)/i);
  let floor = floorMatch ? parseInt(floorMatch[1], 10) : null;

  const cleaned = label.replace(/\s*\(Floor\s*\d\)\s*$/i, '').replace(/^Room\s*/i, '').trim();
  if (!floor) floor = getFloorFromRoom(cleaned);

  const key = cleaned.toLowerCase().replace(/\s+/g, '');
  return { key: cleaned, floor, coords: floor ? (ROOM_DOORS[`${floor}:${key}`]?.[0] || null) : null };
}

// ─── Compatibility exports ────────────────────────────────────────────────────
// FLOOR_GRAPHS / NODES / ROOM_NODE_MAP / STAIR_NODES mirror the shapes older
// callers expect. A room maps to its FIRST doorway here, since these flat
// "one node per room" views have no way to express several.

const FLOOR_GRAPHS = {};
for (const floor of [1, 2, 3]) {
  const graph = getGraph(floor);

  const roomNodeIds = {};
  for (const [key, doors] of Object.entries(ROOM_DOORS)) {
    const [f, rk] = key.split(':');
    if (parseInt(f, 10) !== floor || !doors.length) continue;
    roomNodeIds[rk] = `${doors[0][0]},${doors[0][1]}`;
  }

  const stairNodeIds = {};
  for (const [stairNum, floors] of Object.entries(STAIR_POSITIONS)) {
    if (floors[floor]) stairNodeIds[stairNum] = `${floors[floor][0]},${floors[floor][1]}`;
  }

  const adj = {};
  for (const [k, list] of Object.entries(graph.edges)) {
    adj[k] = list.map(e => ({ id: e.to, dist: e.dist }));
  }

  FLOOR_GRAPHS[floor] = { nodes: graph.nodes, adj, edges: graph.edges, roomNodeIds, stairNodeIds };
}

const NODES = {
  1: FLOOR_GRAPHS[1].nodes,
  2: FLOOR_GRAPHS[2].nodes,
  3: FLOOR_GRAPHS[3].nodes,
};

const ROOM_NODE_MAP = {};
for (const floor of [1, 2, 3]) {
  for (const [rk, nodeKey] of Object.entries(FLOOR_GRAPHS[floor].roomNodeIds)) {
    ROOM_NODE_MAP[`${floor}:${rk}`] = nodeKey;
  }
}

const STAIR_NODES = {};
for (const [stairId] of Object.entries(STAIR_POSITIONS)) {
  STAIR_NODES[stairId] = {};
  for (const floor of [1, 2, 3]) {
    const id = FLOOR_GRAPHS[floor]?.stairNodeIds?.[stairId];
    if (id) STAIR_NODES[stairId][floor] = id;
  }
}

// True when stairwell `stairNum` has a confirmed landing on BOTH floors of a
// trip — i.e. a student can actually use it to get from one to the other.
// Exported so the chatbot engines can be held to the same verified geometry the
// map is drawn from, instead of keeping a second, hand-maintained stair list
// that can (and did) drift into naming stairwells that do not exist.
function stairServes(stairNum, floorA, floorB) {
  const landings = STAIR_POSITIONS[stairNum];
  return !!(landings && landings[floorA] && landings[floorB]);
}

// Every stairwell usable for a trip between these two floors, lowest id first.
function stairsBetween(floorA, floorB) {
  return Object.keys(STAIR_POSITIONS)
    .map(Number)
    .filter(id => stairServes(id, floorA, floorB))
    .sort((a, b) => a - b);
}

module.exports = {
  findPath,
  stairServes,
  stairsBetween,
  resolveRoom,
  getFloorFromRoom,
  labelFor,
  ROOM_LABELS,
  STAIR_POSITIONS,
  ROOM_DOORS,
  CORRIDORS,
  ROOM_NODE_MAP,
  NODES,
  STAIR_NODES,
  FLOOR_GRAPHS,
};
