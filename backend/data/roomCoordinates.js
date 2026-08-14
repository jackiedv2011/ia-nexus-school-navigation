'use strict';

// ─── STAIRWELL POSITIONS ──────────────────────────────────────────────────────
// STAIR_POSITIONS[stairId][floor] = [x, y]
// Stair 3 is NOT accessible from floor 1 (floor-2/3 internal only)

const STAIR_POSITIONS = {
  6: { 1: [1190, 316],  2: [588, 175],   3: [575, 175]  },
  7: { 1: [1785, 155],  2: [1275, 75],   3: [1275, 115] },
  8: { 1: [2153, 155],  2: [1802, 75],   3: [1795, 73]  },
  2: { 1: [1385, 1045], 2: [800, 1105],  3: [800, 1140] },
  4: { 1: [1190, 1335], 2: [665, 1535],  3: [665, 1540] },
  5: { 1: [1905, 1340], 2: [1670, 1505], 3: [1660, 1505]},
  3: { 2: [1615, 1095], 3: [1610, 1145] }, // NOT accessible from floor 1
};

// ─── CORRIDOR DEFINITIONS ─────────────────────────────────────────────────────
// Each corridor segment: horizontal (fixed y, xMin–xMax) or vertical (fixed x, yMin–yMax)

// ─── CORRIDOR DEFINITIONS ─────────────────────────────────────────────────────
// ONLY corridors actually drawn in the annotated blueprint.
// Positions are from pixel analysis of annotated blueprint images (scaled to 2448x1584).
// Horizontal corridors: high-count bands (>5000 pixels) = major drawn corridors.

const CORRIDORS = {
  1: {
    horizontal: [
      { y: 298,  xMin: 1137, xMax: 2170 }, // HC_TOP   — north upper corridor (rooms 116,161,164,172,174,192)
      { y: 470,  xMin: 276,  xMax: 2172 }, // HC_MAIN  — full-width main corridor (rooms 188,184,186,173,191 + main building)
      { y: 660,  xMin: 271,  xMax: 2165 }, // HC_MID   — lower corridor (rooms 181-189 + main building lower)
      { y: 816,  xMin: 1162, xMax: 2168 }, // HC_BOT   — bottom corridor (rooms 101-104,121-124,136,138,151-155) — extended left to VC_MID2
    ],
    vertical: [
      { x: 278,  yMin: 451, yMax: 705  }, // VC_LEFT  — engineering left connector
      { x: 1123, yMin: 312, yMax: 704  }, // VC_MID1  — main center-left connector
      { x: 1162, yMin: 310, yMax: 1216 }, // VC_MID2  — center, extends to nursing wing
      { x: 1200, yMin: 486, yMax: 1335 }, // VC_MID3  — nursing/EMS wing (extended to reach Stair 4.1)
      // VC_MID4 — FCS/PE wing. Extended down from 829 to 1216 (matching the
      // neighbouring VC_MID2/VC_MID3): rooms 157 and 159 have doors at exactly
      // x=1430, y=1015 and y=1185, i.e. on this corridor's centre-line but below
      // where it was recorded as stopping, so they had nothing to attach to.
      { x: 1430, yMin: 483, yMax: 1216 }, // VC_MID4  — FCS/PE wing
      { x: 1490, yMin: 660, yMax: 1050 }, // VC_OFFICE — office corridor (extended up to HC_MID; between CONFERENCE/ATTN-REG and VAULT/OFFICER)
      { x: 1905, yMin: 816, yMax: 1340 }, // VC_LOCKER — locker room corridor from HC_BOT down to Stair 5
      { x: 1661, yMin: 165, yMax: 978  }, // VC_MID5  — main right-center (STAIR 7/8 area)
      { x: 2160, yMin: 323, yMax: 1258 }, // VC_RIGHT — far right
    ],
  },
  2: {
    horizontal: [
      // HC_TOP — main top corridor CORR 260/270 (rooms 261-277 face south here).
      // Extended east from 1971 to 2170 to reach the NE wing: rooms 292/293/294
      // have doors at x=1957-2082 either side of this corridor's line, and were
      // otherwise stranded ~270px from anything.
      { y: 298,  xMin: 591,  xMax: 2170 }, // HC_TOP
      { y: 912,  xMin: 592,  xMax: 1816 }, // HC_BOT — main south corridor CORR 220/230
      { y: 270,  xMin: 301,  xMax: 590  }, // NW_TOP — NW wing CORR 280 (rooms 281/283)
      { y: 390,  xMin: 301,  xMax: 590  }, // NW_BOT — NW wing CORR 260.1 (rooms 282/284)
    ],
    vertical: [
      // yMin/yMax extended where a corridor stopped short of the stairwell it
      // serves — the stair landings are physically on these corridors, so
      // without this the router had to elbow across open space to reach them.
      { x: 586,  yMin: 166, yMax: 1535 }, // VC_LEFT  — CORR 240 (rooms 241-249 + STAIR 6.2, 4.2)
      { x: 1200, yMin: 291, yMax: 926  }, // VC_MID   — center drawn corridor (STAIR 3.2 area)
      { x: 1814, yMin: 75,  yMax: 1505 }, // VC_RIGHT — CORR 250 (rooms 252,258 + STAIR 8.2, 5.2)
    ],
  },
  3: {
    horizontal: [
      // HC_TOP — main top corridor (rooms 363-379 face south here). Extended east
      // from 1985 to 2170 for the same reason as floor 2: rooms 392/393/394 sit
      // on this line past where it was recorded as ending.
      { y: 298,  xMin: 453,  xMax: 2170 }, // HC_TOP
      { y: 950,  xMin: 597,  xMax: 1833 }, // HC_BOT — main south corridor
      { y: 270,  xMin: 301,  xMax: 605  }, // NW_TOP — NW wing (rooms 381/383)
      { y: 390,  xMin: 301,  xMax: 605  }, // NW_BOT — NW wing (rooms 382/384)
    ],
    vertical: [
      { x: 605,  yMin: 166, yMax: 1540 }, // VC_LEFT  — left wing corridor (rooms 341-349 + STAIR 6.3, 4.3)
      { x: 989,  yMin: 294, yMax: 963  }, // VC_MID1  — center-left drawn corridor
      { x: 1219, yMin: 304, yMax: 957  }, // VC_MID2  — center drawn corridor (STAIR 3.3 area)
      { x: 1834, yMin: 73,  yMax: 1509 }, // VC_RIGHT — right wing (rooms 354,356 + STAIR 8.3)
    ],
  },
};

// ─── ROOM DOOR POSITIONS ──────────────────────────────────────────────────────
// ROOM_DOORS['floor:roomNum'] = [x, y]  — exact door entry point on corridor

// ─── ROOM DOOR POSITIONS ─────────────────────────────────────────────────────
// Each room's door threshold — where the quarter-circle (door swing) meets the hallway.
// Rooms ABOVE a corridor: door at room's south wall (y < corridor_y).
// Rooms BELOW a corridor: door at room's north wall (y > corridor_y).
// Rooms LEFT of a corridor: door at room's east wall (x < corridor_x).
// Rooms RIGHT of a corridor: door at room's west wall (x > corridor_x).

const ROOM_DOORS = {
  // ── FLOOR 1 ──────────────────────────────────────────────────────────────────
  // Quarter circle positions measured from actual map crops.
  // HC_TOP corridor y=298, HC_MAIN y=470, HC_MID y=660, HC_BOT y=816

  // HC_TOP rooms — door x from detected wall gaps (y=255-275), y=265 at south wall
  '1:164':  [1146, 265],   // Mechanical (was x=985)
  '1:161':  [1271, 265],   // Kitchen (was x=1385)
  '1:116':  [1618, 265],   // Music Tech (was x=1480)
  '1:172':  [2018, 265],   // (was x=1735)
  '1:174':  [2082, 265],   // (was x=1885)
  '1:192':  [2151, 265],   // Visual Arts (was x=2160)

  // Outdoor Courtyard 180 — placed at HC_MAIN entry point near west wing
  '1:180':  [455,  488],   // Outdoor Courtyard

  // HC_MAIN engineering upper rooms — door x from detected gaps at y=415-430
  '1:188':  [277,  421],   // Energy Systems Lab — main door at x=277
  '1:186':  [429,  421],   // Storage
  '1:184':  [666,  421],   // Mechatronics Lab — main door at x=666
  '1:173':  [1775, 488],   // Teacher Planning — opens north to HC_MAIN
  '1:191':  [2160, 488],   // Media Arts Lab

  // HC_MID manufacturing rooms — door x from detected gaps at y=705-725
  '1:189':  [285,  715],   // Manufacturing Lab (was x=200)
  '1:187':  [391,  715],   // Metal Shop (was x=340)
  '1:185':  [473,  715],   // Storage (was x=445)
  '1:183':  [577,  715],   // Wood Shop
  '1:181':  [671,  715],   // Engineering & Tech (was x=730)

  // HC_BOT — admin/reception side (LEFT of VC_OFFICE at x=1490) — corrected positions
  '1:101':  [1200, 816],   // Reception lobby — on VC_MID3 / HC_BOT intersection
  '1:102':  [1255, 816],   // Sec/Clerical — HC_BOT, left of VC_OFFICE
  '1:103':  [1330, 816],   // Attn/Reg — HC_BOT, left of VC_OFFICE
  '1:104':  [1420, 816],   // Conference — HC_BOT, just left of VC_OFFICE

  // HC_BOT — cafeteria / main hall rooms (original positions, correct)
  '1:123':  [1319, 805],   // (was x=1360)
  '1:124':  [1447, 805],   // Lecture Hall — center of room area
  '1:122':  [1773, 805],   // (large room, door near east side)
  '1:121':  [1945, 828],
  '1:152':  [2162, 828],   // Fitness Room

  // VC_OFFICE (x=1490) and HC_BOT (y=816) — office/vault wing (RIGHT of VC_OFFICE)
  '1:135':  [1490, 742],   // Vault 135.1 — on VC_OFFICE, above HC_BOT
  '1:136':  [1590, 816],   // Room 136 — HC_BOT, right of VC_OFFICE
  '1:137':  [1490, 870],   // PA III / Officer (137.1/137.2) — VC_OFFICE, below HC_BOT
  '1:138':  [1745, 816],   // Tech Spec 138 — HC_BOT, further right
  '1:139':  [1490, 1005],  // Princ Off II — VC_OFFICE, lower section

  // Locker rooms — on VC_LOCKER corridor (x=1905, y=816→1340)
  '1:151':  [1940, 816],   // Room 151 — HC_BOT, far right section
  '1:153':  [1905, 965],   // Girls' Locker Rm — VC_LOCKER corridor
  '1:155':  [1905, 1080],  // Boys' Locker Rm — VC_LOCKER corridor

  // VC_MID4 south wing (x=1430)
  '1:157':  [1430, 1015],
  '1:159':  [1430, 1185],

  // VC_RIGHT south (x=2160)
  '1:158':  [2160, 1119],

  // Nursing/EMS south wing — VC_MID2 (x=1162) and east column (x=1240)
  '1:141':  [1162, 800],
  '1:143':  [1162, 900],
  '1:145':  [1162, 954],
  '1:147':  [1162, 1119],
  '1:142':  [1240, 900],
  '1:144':  [1240, 1015],
  '1:146':  [1240, 1119],

  // ── FLOOR 2 ──────────────────────────────────────────────────────────────────
  // HC_TOP corridor y=298.
  // Top-row rooms: quarter circles at y≈230 (south side, ~68px above corridor).
  // Second-row rooms: quarter circles at y≈315 (north side, ~17px below corridor).
  // HC_BOT corridor y=912.
  // Rooms above HC_BOT: quarter circles at y≈870 (~42px above).
  // Rooms below HC_BOT: quarter circles at y≈935 (~23px below).

  // NW wing
  '2:283':  [355,  255],   // south door — quarter circle y≈255 (above NW_TOP y=270)
  '2:281':  [470,  255],
  '2:284':  [355,  380],   // south door — quarter circle y≈380 (above NW_BOT y=390)
  '2:282':  [470,  380],

  // HC_TOP top-row rooms — door x from detected wall gaps at y=255-275
  '2:267':  [669,  265],
  '2:265':  [815,  265],
  '2:263':  [1140, 265],
  '2:261':  [1260, 265],   // Ext Learning
  '2:272':  [1458, 265],
  '2:274':  [1621, 265],
  '2:292':  [1957, 265],
  '2:294':  [2082, 265],

  // HC_TOP second-row rooms — door x from detected gaps at y=320-340
  '2:268':  [596,  329],
  '2:264':  [867,  329],
  '2:262':  [918,  329],
  '2:273':  [1266, 329],
  '2:275':  [1429, 329],
  '2:277':  [1662, 329],
  '2:291':  [1810, 329],
  '2:293':  [2080, 329],

  // Media Center / MakerSpace
  '2:210':  [1200, 600],
  '2:232':  [1200, 840],

  // HC_BOT rooms above — door x from detected gaps at y=895-910
  '2:224':  [705,  903],
  '2:222':  [978,  903],
  '2:236':  [1680, 903],

  // HC_BOT rooms below — door x from detected gaps at y=945-960
  '2:223':  [821,  954],
  '2:231':  [1133, 954],
  '2:233':  [1266, 954],
  '2:235':  [1585, 954],

  // VC_LEFT (x=586) — rooms opening east have quarter circle at x≈568 (inside room)
  '2:241':  [586,  912],
  '2:242':  [568,  1000],
  '2:243':  [568,  990],
  '2:244':  [568,  1100],
  '2:245':  [568,  1035],
  '2:246':  [568,  1230],
  '2:247':  [568,  1095],
  '2:249':  [568,  1195],

  // VC_RIGHT (x=1814) — west-opening rooms at x≈1832, east-opening at x≈1796
  '2:252':  [1832, 960],
  '2:251':  [1796, 1075],
  '2:253':  [1796, 1320],
  '2:258':  [1832, 1360],

  // ── FLOOR 3 ──────────────────────────────────────────────────────────────────
  // HC_TOP corridor y=298.
  // Top-row rooms: quarter circles at y≈230 (south side).
  // Second-row rooms: quarter circles at y≈315 (north side).
  // HC_BOT corridor y=950.
  // Rooms above: quarter circles at y≈930. Rooms below: y≈965.

  // NW wing
  '3:383':  [355,  255],
  '3:381':  [470,  255],
  '3:384':  [355,  380],
  '3:382':  [470,  380],

  // HC_TOP top-row rooms — door x from detected gaps at y=255-278
  '3:367':  [632,  265],
  '3:363':  [901,  265],
  '3:372':  [1596, 265],
  '3:392':  [1915, 265],
  '3:394':  [2082, 265],

  // HC_TOP second-row rooms — door x from detected gaps at y=322-342
  '3:364':  [651,  332],
  '3:362':  [919,  332],
  '3:373':  [1214, 332],
  '3:375':  [1450, 332],
  '3:377':  [1583, 332],
  '3:379':  [1740, 332],
  '3:391':  [1831, 332],
  '3:393':  [2080, 332],

  // HC_BOT rooms above — door x from detected gaps at y=912-928
  '3:336':  [1678, 922],
  '3:324':  [762,  922],
  '3:322':  [927,  922],
  '3:332':  [1387, 922],
  '3:334':  [1492, 922],

  // HC_BOT rooms below — door x from detected gaps at y=984-1000
  '3:301':  [1139, 993],
  '3:331':  [1443, 993],
  '3:333':  [1603, 993],

  // VC_LEFT (x=605) — rooms opening east: quarter circle at x≈588 (inside room)
  '3:341':  [605,  950],
  '3:343':  [588,  1000],
  '3:345':  [588,  1110],
  '3:349':  [588,  1370],
  '3:342':  [622,  1040],  // opens west, quarter circle x≈622
  '3:346':  [622,  1370],

  // VC_RIGHT (x=1834) — west-opening at x≈1852, east-opening at x≈1816
  '3:354':  [1852, 980],
  '3:351':  [1816, 1045],
  '3:356':  [1852, 1310],
  '3:359':  [1816, 1310],
};

// ─── GRAPH BUILDER ────────────────────────────────────────────────────────────

// Corridor extents were measured off the blueprint by hand, so a junction that
// is physically a T or a cross can be recorded a few pixels short of touching
// (observed gaps: 1px to 25px). A strict containment test then silently drops
// that junction, and the router detours around it — e.g. floor 3's VC_MID2
// missed HC_TOP by 6px, so 116 -> 333 swung west and cut through the Media
// Center instead of dropping straight down. Snapping junctions that are within
// this many pixels of meeting fixes the whole class of bug without hand-editing
// each number. Kept just above the largest real gap (25px) and well below the
// distance to any unrelated corridor, so it can't invent a junction that isn't
// physically there.
const JUNCTION_TOL = 30;

function buildFloorGraph(floor) {
  const corrs = CORRIDORS[floor];
  const nodes = {}; // "x,y" -> { id, x, y }
  const edges = {}; // "x,y" -> [{ to: "x,y", dist }]

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
    // Avoid duplicate edges
    if (!edges[a].some(e => e.to === b)) edges[a].push({ to: b, dist });
    if (!edges[b].some(e => e.to === a)) edges[b].push({ to: a, dist });
  }

  // ── Attachment points: every room door and stairwell on this floor ─────────
  // Each one has to meet the corridor network somewhere. Previously they were
  // snapped onto a corridor only when they happened to sit within 60px of one,
  // and anything else was wired to whatever node was nearest in a straight
  // line — which drew diagonal lines straight across rooms (a stairwell 183px
  // from its corridor would cut the corner rather than walk out to the hall).
  // Instead every point is now projected PERPENDICULARLY onto the nearest
  // corridor, so the stub that joins it to the network is always a clean
  // right-angle walk out of the doorway.
  const attachPoints = [];
  for (const [key, [rx, ry]] of Object.entries(ROOM_DOORS)) {
    if (parseInt(key.split(':')[0], 10) !== floor) continue;
    attachPoints.push([rx, ry]);
  }
  for (const floors of Object.values(STAIR_POSITIONS)) {
    if (floors[floor]) attachPoints.push(floors[floor]);
  }

  // Foot of the perpendicular from a point to the nearest corridor. The foot is
  // clamped to the corridor's own extent so it can never land off the end of it.
  //
  // A foot that did NOT need clamping is preferred: it lies straight across from
  // the door, so the stub is a single straight walk, whereas a clamped foot sits
  // past the end of the corridor and needs an elbow that cuts across whatever is
  // in between. That preference is expressed as a fixed penalty rather than an
  // absolute rule, so a clamped foot still wins when it is dramatically closer.
  // Both cases are real: stair 7.1 is 124px from the end of a vertical corridor
  // but 143px straight down to the top corridor, and the straight drop is the
  // true walk; stair 4.2 is 105px past the end of its corridor but 623px from
  // the nearest one it lines up with, and there the short hop is obviously right.
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

  // For each horizontal corridor: collect all points on it, sort by x, connect consecutive
  for (const hc of corrs.horizontal) {
    const pts = new Map(); // x -> y (using map to dedup by x key)

    // Corridor endpoints
    pts.set(hc.xMin, hc.y);
    pts.set(hc.xMax, hc.y);

    // Vertical corridor intersections (see JUNCTION_TOL — tolerant so a
    // junction recorded a few pixels short still connects)
    for (const vc of corrs.vertical) {
      if (vc.x >= hc.xMin - JUNCTION_TOL && vc.x <= hc.xMax + JUNCTION_TOL &&
          hc.y >= vc.yMin - JUNCTION_TOL && hc.y <= vc.yMax + JUNCTION_TOL) {
        pts.set(vc.x, hc.y);
      }
    }

    // Feet of every door/stair that projects onto THIS corridor
    for (const a of attachments) {
      if (a.foot.axis === 'h' && a.foot.corr === hc) pts.set(a.foot.x, hc.y);
    }

    // Sort by x and connect consecutive
    const sorted = Array.from(pts.entries()).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = nodeId(sorted[i][0], sorted[i][1]);
      const b = nodeId(sorted[i + 1][0], sorted[i + 1][1]);
      addEdge(a, b);
    }
  }

  // For each vertical corridor: collect all points on it, sort by y, connect consecutive
  for (const vc of corrs.vertical) {
    const pts = new Map(); // y -> x

    // Corridor endpoints
    pts.set(vc.yMin, vc.x);
    pts.set(vc.yMax, vc.x);

    // Horizontal corridor intersections — same tolerance, and the node created
    // here is identical to the one the horizontal pass creates, so the two
    // corridors genuinely share a node rather than crossing without meeting.
    for (const hc of corrs.horizontal) {
      if (hc.y >= vc.yMin - JUNCTION_TOL && hc.y <= vc.yMax + JUNCTION_TOL &&
          vc.x >= hc.xMin - JUNCTION_TOL && vc.x <= hc.xMax + JUNCTION_TOL) {
        pts.set(hc.y, vc.x);
      }
    }

    // Feet of every door/stair that projects onto THIS corridor
    for (const a of attachments) {
      if (a.foot.axis === 'v' && a.foot.corr === vc) pts.set(a.foot.y, vc.x);
    }

    // Sort by y and connect consecutive
    const sorted = Array.from(pts.entries()).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = nodeId(sorted[i][1], sorted[i][0]);
      const b = nodeId(sorted[i + 1][1], sorted[i + 1][0]);
      addEdge(a, b);
    }
  }

  // Join each door / stairwell to its foot on the corridor. Normally that is a
  // single straight stub (the door sits directly across from its foot). If the
  // foot had to be clamped to the corridor's end the two differ on both axes,
  // so an elbow is inserted to keep the walk at right angles instead of
  // drawing a diagonal across whatever is in between.
  for (const { pt, foot } of attachments) {
    const pKey = nodeId(pt[0], pt[1]);
    const fKey = nodeId(foot.x, foot.y);
    if (pt[0] === foot.x || pt[1] === foot.y) {
      addEdge(pKey, fKey);
    } else {
      const elbow = foot.axis === 'h'
        ? nodeId(pt[0], foot.y)   // walk out to the corridor's line, then along it
        : nodeId(foot.x, pt[1]);
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

// Pre-build all graphs
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

function getRoomDoorKey(roomStr, floor) {
  const door = ROOM_DOORS[getRoomKey(roomStr, floor)];
  if (!door) return null;
  return `${door[0]},${door[1]}`;
}

function getStairKey(stairNum, floor) {
  const pos = STAIR_POSITIONS[stairNum]?.[floor];
  if (!pos) return null;
  return `${pos[0]},${pos[1]}`;
}

function ensureRoomInGraph(graph, roomStr, floor) {
  const key = getRoomKey(roomStr, floor);
  const door = ROOM_DOORS[key];
  if (!door) return;
  const nodeKey = `${door[0]},${door[1]}`;
  if (graph.nodes[nodeKey]) return;

  graph.nodes[nodeKey] = { id: nodeKey, x: door[0], y: door[1] };
  graph.edges[nodeKey] = [];

  let best = null, bestDist = Infinity;
  for (const [k, n] of Object.entries(graph.nodes)) {
    if (k === nodeKey) continue;
    const d = Math.hypot(n.x - door[0], n.y - door[1]);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  if (best) {
    graph.edges[nodeKey].push({ to: best, dist: bestDist });
    graph.edges[best].push({ to: nodeKey, dist: bestDist });
  }
}

function ensureStairInGraph(graph, stairNum, floor) {
  const pos = STAIR_POSITIONS[stairNum]?.[floor];
  if (!pos) return;
  const nodeKey = `${pos[0]},${pos[1]}`;
  if (graph.nodes[nodeKey]) return;

  graph.nodes[nodeKey] = { id: nodeKey, x: pos[0], y: pos[1] };
  graph.edges[nodeKey] = [];

  let best = null, bestDist = Infinity;
  for (const [k, n] of Object.entries(graph.nodes)) {
    if (k === nodeKey) continue;
    const d = Math.hypot(n.x - pos[0], n.y - pos[1]);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  if (best) {
    graph.edges[nodeKey].push({ to: best, dist: bestDist });
    graph.edges[best].push({ to: nodeKey, dist: bestDist });
  }
}

// ─── findPath ─────────────────────────────────────────────────────────────────

function findPath(fromRoom, fromFloor, toRoom, toFloor) {
  fromFloor = parseInt(fromFloor, 10);
  toFloor   = parseInt(toFloor,   10);

  const fromLabel = `Room ${fromRoom}`;
  const toLabel   = `Room ${toRoom}`;

  // Same-floor navigation
  if (fromFloor === toFloor) {
    const graph = getGraph(fromFloor);
    ensureRoomInGraph(graph, fromRoom, fromFloor);
    ensureRoomInGraph(graph, toRoom,   toFloor);

    const startKey = getRoomDoorKey(fromRoom, fromFloor);
    const endKey   = getRoomDoorKey(toRoom,   toFloor);

    if (!startKey || !endKey) {
      return { error: 'Room not found', sameFloor: true, path1: [], fromFloor, toFloor, fromLabel, toLabel };
    }

    const result = dijkstra(graph, startKey, endKey);
    return {
      sameFloor:    true,
      fromFloor,
      toFloor,
      fromLabel,
      toLabel,
      path1:        result?.path || [],
      path2:        null,
      stairNum:     null,
      stairFromPos: null,
      stairToPos:   null,
    };
  }

  // Cross-floor navigation: stair 3 only accessible floors 2-3
  const accessibleStairs = fromFloor === 1
    ? [2, 4, 5, 6, 7, 8]
    : [2, 3, 4, 5, 6, 7, 8];

  const graphFrom = getGraph(fromFloor);
  const graphTo   = getGraph(toFloor);

  ensureRoomInGraph(graphFrom, fromRoom, fromFloor);
  ensureRoomInGraph(graphTo,   toRoom,   toFloor);

  let best = null, bestCost = Infinity, bestStair = null;

  for (const stairNum of accessibleStairs) {
    if (!STAIR_POSITIONS[stairNum]?.[fromFloor] || !STAIR_POSITIONS[stairNum]?.[toFloor]) continue;

    ensureStairInGraph(graphFrom, stairNum, fromFloor);
    ensureStairInGraph(graphTo,   stairNum, toFloor);

    const startKey     = getRoomDoorKey(fromRoom, fromFloor);
    const stairFromKey = getStairKey(stairNum, fromFloor);
    const stairToKey   = getStairKey(stairNum, toFloor);
    const endKey       = getRoomDoorKey(toRoom, toFloor);

    if (!startKey || !stairFromKey || !stairToKey || !endKey) continue;

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

  if (!best) {
    return {
      error:        'No path found',
      sameFloor:    false,
      fromFloor,
      toFloor,
      fromLabel,
      toLabel,
      path1:        [],
      path2:        [],
      stairNum:     null,
      stairFromPos: null,
      stairToPos:   null,
    };
  }

  return {
    sameFloor:    false,
    fromFloor,
    toFloor,
    fromLabel,
    toLabel,
    path1:        best.leg1.path,
    path2:        best.leg2.path,
    stairNum:     bestStair,
    stairFromPos: STAIR_POSITIONS[bestStair][fromFloor],
    stairToPos:   STAIR_POSITIONS[bestStair][toFloor],
  };
}

// ─── resolveRoom (backward compatibility) ────────────────────────────────────

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
  const floor = floorMatch ? parseInt(floorMatch[1], 10) : null;

  const numMatch = label.match(/Room\s*([\d.]+)/i);
  if (numMatch && floor) {
    const key = numMatch[1];
    return { key, floor, coords: ROOM_DOORS[`${floor}:${key}`] || null };
  }

  const name = label.replace(/\s*\(Floor\s*\d\)\s*$/i, '').trim().toLowerCase().replace(/\s+/g, '');
  return { key: name, floor, coords: ROOM_DOORS[`${floor}:${name}`] || null };
}

// ─── Compatibility exports (NODES, ROOM_NODE_MAP, STAIR_NODES, FLOOR_GRAPHS) ──

// FLOOR_GRAPHS mirrors the old shape: { nodes, adj, roomNodeIds, stairNodeIds }
const FLOOR_GRAPHS = {};
for (const floor of [1, 2, 3]) {
  const graph = getGraph(floor);

  // Build roomNodeIds: roomKey -> nodeKey ("x,y")
  const roomNodeIds = {};
  for (const [key] of Object.entries(ROOM_DOORS)) {
    const [f, rk] = key.split(':');
    if (parseInt(f, 10) !== floor) continue;
    const door = ROOM_DOORS[key];
    if (door) roomNodeIds[rk] = `${door[0]},${door[1]}`;
  }

  // Build stairNodeIds: stairNum -> nodeKey ("x,y")
  const stairNodeIds = {};
  for (const [stairNum, floors] of Object.entries(STAIR_POSITIONS)) {
    if (floors[floor]) {
      stairNodeIds[stairNum] = `${floors[floor][0]},${floors[floor][1]}`;
    }
  }

  // adj mirrors edges but uses { id, dist } shape instead of { to, dist }
  const adj = {};
  for (const [k, list] of Object.entries(graph.edges)) {
    adj[k] = list.map(e => ({ id: e.to, dist: e.dist }));
  }

  FLOOR_GRAPHS[floor] = {
    nodes: graph.nodes,
    adj,
    edges: graph.edges,
    roomNodeIds,
    stairNodeIds,
  };
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

module.exports = {
  findPath,
  resolveRoom,
  getFloorFromRoom,
  STAIR_POSITIONS,
  ROOM_DOORS,
  CORRIDORS,
  ROOM_NODE_MAP,
  NODES,
  STAIR_NODES,
  FLOOR_GRAPHS,
};
