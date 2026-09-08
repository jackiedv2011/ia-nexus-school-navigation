'use strict';
// Derives a floor plan (rooms, halls, doorways, stairs) straight from the
// router's own data, so the model and the pathfinder cannot disagree.
//
// The building records doorway POINTS, never room outlines, so a room's extent
// is inferred: it fronts the corridor its doors open onto, runs back as far as
// the next corridor allows, and shares that frontage with its neighbours.

const { CORRIDORS, ROOM_DOORS, STAIR_POSITIONS, ROOM_LABELS } =
  require('../data/roomCoordinates');

const HALL_HALF   = 23;   // drawn half-width of a corridor
const WALL_GAP    = 26;   // clearance a room keeps off a corridor centreline
const DEPTH       = 215;  // how deep a room runs back from its corridor
const CUT_OVERLAP = 30;   // perpendicular overlap before a corridor splits a band
const MAX_OVERRUN = 190;  // how far a room may run past its own outermost door

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const hits = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

function segsOf(floor) {
  const C = CORRIDORS[floor];
  return [
    ...C.horizontal.map((h, i) => ({ id:`h${i}`, axis:'h', pos:h.y, min:h.xMin, max:h.xMax })),
    ...C.vertical.map((v, i)   => ({ id:`v${i}`, axis:'v', pos:v.x, min:v.yMin, max:v.yMax })),
  ];
}

// Nearest corridor whose perpendicular foot lands inside the segment. A door
// past every corridor's end (floor 1's room 192) falls back to the nearest
// endpoint, which is what the router does too.
const CLAMP_PENALTY = 60;   // what the router charges for reaching past an end

function attacher(SEGS) {
  return function attach([x, y]) {
    let best = null;
    for (const s of SEGS) {
      const raw   = s.axis === 'h' ? x : y;
      const along = Math.min(Math.max(raw, s.min), s.max);
      const off   = (s.axis === 'h' ? y : x) - s.pos;
      const over  = Math.abs(raw - along);
      const d     = Math.abs(off) + over + (over ? CLAMP_PENALTY : 0);
      if (!best || d < best.dist) {
        best = { seg:s, dist:d, along, side: off >= 0 ? 1 : -1 };
      }
    }
    return best;
  };
}

// The deepest a stairwell of the given width can be here without running into
// the next corridor along.
function stairDepthLimit(floor, W) {
  const SEGS = segsOf(floor), attach = attacher(SEGS);
  let limit = DEPTH;
  for (const landings of Object.values(STAIR_POSITIONS)) {
    if (!landings[floor]) continue;
    const a = attach(landings[floor]);
    const lo = a.along - W / 2, hi = a.along + W / 2;
    for (const s of SEGS) {
      if (s.axis !== a.seg.axis || s === a.seg) continue;
      if (Math.sign(s.pos - a.seg.pos) !== a.side) continue;
      if (Math.min(s.max, hi) - Math.max(s.min, lo) < CUT_OVERLAP) continue;  // barely alongside
      limit = Math.min(limit, Math.abs(s.pos - a.seg.pos) - WALL_GAP - HALL_HALF);
    }
  }
  return limit;
}

function buildFloor(FLOOR, STAIR_W, STAIR_D) {
  const SEGS = segsOf(FLOOR), attach = attacher(SEGS);
  const footOf = (p) => {
    const a = attach(p);
    return a.seg.axis === 'h' ? [a.along, a.seg.pos] : [a.seg.pos, a.along];
  };

  const labelOf = {};
  for (const name of ROOM_LABELS[FLOOR]) labelOf[norm(name)] = name;

  const members = [];
  for (const [key, doors] of Object.entries(ROOM_DOORS)) {
    const [f, room] = key.split(':');
    if (parseInt(f, 10) !== FLOOR) continue;
    const anchors = doors.map(attach).filter(Boolean);
    if (!anchors.length) throw new Error(`${key}: no corridor reaches any of its doors`);
    // A room's doors normally share one corridor face; where they don't, the
    // face carrying the most of them wins.
    const tally = {};
    for (const a of anchors) (tally[`${a.seg.id}:${a.side}`] ||= []).push(a);
    const onLine = anchors.every(a => a.dist === 0);
    const [band, group] = Object.entries(tally).sort((a, b) => b[1].length - a[1].length)[0];
    members.push({
      kind:'room', name: labelOf[norm(room)] || room, band,
      seg: group[0].seg, side: group[0].side,
      onLine,
      lo: Math.min(...group.map(a => a.along)),
      hi: Math.max(...group.map(a => a.along)),
      doors: doors.map(d => ({ at:d, foot: footOf(d) })),
    });
  }

  for (const [id, landings] of Object.entries(STAIR_POSITIONS)) {
    const at = landings[FLOOR];
    if (!at) continue;
    const a = attach(at);
    members.push({
      kind:'stair', name:`Stair ${id}`, band:`${a.seg.id}:${a.side}`,
      seg:a.seg, side:a.side, lo:a.along, hi:a.along, landing:at, foot: footOf(at),
    });
  }

  // ── band geometry ──────────────────────────────────────────────────────────
  const bands = {};
  for (const m of members) (bands[m.band] ||= []).push(m);

  function outerEdge(seg, side) {
    let gap = Infinity;
    for (const s of SEGS) {
      if (s.axis !== seg.axis || s === seg) continue;
      if (Math.sign(s.pos - seg.pos) !== side) continue;
      if (Math.min(s.max, seg.max) - Math.max(s.min, seg.min) < CUT_OVERLAP) continue;
      gap = Math.min(gap, Math.abs(s.pos - seg.pos));
    }
    return seg.pos + side * Math.min(DEPTH, gap === Infinity ? DEPTH : gap - WALL_GAP);
  }

  function cutsFor(seg, inner, outer) {
    const [lo, hi] = [Math.min(inner, outer), Math.max(inner, outer)];
    return SEGS
      .filter(s => s.axis !== seg.axis &&
                   Math.min(s.max, hi) - Math.max(s.min, lo) > CUT_OVERLAP &&
                   s.pos > seg.min - HALL_HALF && s.pos < seg.max + HALL_HALF)
      .map(s => s.pos).sort((a, b) => a - b);
  }

  const ROOMS = [], STAIRS = [], DOORS = [];

  for (const group of Object.values(bands)) {
    const seg = group[0].seg, side = group[0].side;
    const inner = seg.pos + side * WALL_GAP;
    const outer = outerEdge(seg, side);
    const cuts  = cutsFor(seg, inner, outer);
    group.sort((a, b) => a.lo - b.lo);

    // Every stairwell is one size, so it claims a fixed slot on its landing and
    // the rooms beside it take whatever frontage is left.
    group.forEach(m => { if (m.kind === 'stair') m.span = [m.lo - STAIR_W / 2, m.lo + STAIR_W / 2]; });

    group.forEach((m, i) => {
      if (m.kind === 'stair') return;
      const prev = group[i - 1], next = group[i + 1];
      let a = !prev ? seg.min : (prev.kind === 'stair' ? prev.span[1] : (prev.hi + m.lo) / 2);
      let b = !next ? seg.max : (next.kind === 'stair' ? next.span[0] : (m.hi + next.lo) / 2);
      const mid = (m.lo + m.hi) / 2;
      for (const c of cuts) {
        if (c <= mid) a = Math.max(a, c + WALL_GAP);
        else          b = Math.min(b, c - WALL_GAP);
      }
      // Frontage is only evidence near a door; the rest is unmapped space.
      a = Math.max(a, m.lo - MAX_OVERRUN);
      b = Math.min(b, m.hi + MAX_OVERRUN);
      if (b - a < 60) {
        // The cuts left the room almost nothing. Reclaim frontage around its
        // door, but never into a stairwell's slot — that footprint is fixed.
        if (!prev || prev.kind !== 'stair') a = Math.min(a, Math.min(m.lo, m.hi) - 95);
        if (!next || next.kind !== 'stair') b = Math.max(b, Math.max(m.lo, m.hi) + 95);
      }
      m.span = [a, b];
    });

    group.forEach(m => {
      const [a, b] = m.span;
      const far = m.kind === 'stair' ? seg.pos + side * (WALL_GAP + STAIR_D) : outer;
      const rect = seg.axis === 'h'
        ? { x1:a, x2:b, y1:Math.min(inner, far), y2:Math.max(inner, far) }
        : { y1:a, y2:b, x1:Math.min(inner, far), x2:Math.max(inner, far) };
      if (m.kind === 'stair') {
        STAIRS.push({ name:m.name, landing:m.landing, foot:m.foot, rect, axis:seg.axis, side });
      } else {
        ROOMS.push({ name:m.name, rect, doors:m.doors.map(d => d.at),
                     onLine:m.onLine, segAxis:seg.axis, segPos:seg.pos });
        for (const d of m.doors) DOORS.push({ room:m.name, at:d.at, foot:d.foot });
      }
    });
  }

  // On floor 3 the library is the block the four central corridors box in; with
  // one door it would otherwise be sized like an ordinary classroom.
  if (FLOOR === 3) {
    const lib = ROOMS.find(r => /xchange/i.test(r.name));
    if (lib) lib.rect = { x1:975, x2:1183, y1:562, y2:688 };
  }

  const HALLS = SEGS.map(s => s.axis === 'h'
    ? { x1:s.min, x2:s.max, y1:s.pos - HALL_HALF, y2:s.pos + HALL_HALF }
    : { y1:s.min, y2:s.max, x1:s.pos - HALL_HALF, x2:s.pos + HALL_HALF });

  // ── separate anything sharing floor space ──────────────────────────────────
  const adjusted = [];

  // A stairwell keeps its size, so where one straddles a corridor that crosses
  // its own, it slides along the corridor until it is clear.


  const anchorsOf = (it) => it.doors ? it.doors : [it.landing];
  function shrinkAway(it, other) {
    const a = it.rect, b = other.rect;
    const opts = [
      { k:'x1', v:b.x2, loss:b.x2 - a.x1 }, { k:'x2', v:b.x1, loss:a.x2 - b.x1 },
      { k:'y1', v:b.y2, loss:b.y2 - a.y1 }, { k:'y2', v:b.y1, loss:a.y2 - b.y1 },
    ].filter(o => {
      const r = Object.assign({}, a, { [o.k]: o.v });
      if (r.x2 - r.x1 < 55 || r.y2 - r.y1 < 55) return false;
      return anchorsOf(it).every(p => p[0] >= r.x1 - 70 && p[0] <= r.x2 + 70 &&
                                      p[1] >= r.y1 - 70 && p[1] <= r.y2 + 70);
    }).sort((p, q) => p.loss - q.loss);
    if (!opts.length) return false;
    a[opts[0].k] = opts[0].v;
    return true;
  }

  // Two stairwells that claim the same floor: the later one slides along its
  // corridor, since both must keep the same footprint.
  for (let i = 0; i < STAIRS.length; i++) for (let j = i + 1; j < STAIRS.length; j++) {
    const a = STAIRS[i], b = STAIRS[j];
    if (!hits(a.rect, b.rect)) continue;
    const r = b.rect;
    if (b.axis === 'h') {
      const d = Math.abs(a.rect.x1 - r.x2) < Math.abs(a.rect.x2 - r.x1)
        ? a.rect.x1 - r.x2 : a.rect.x2 - r.x1;
      r.x1 += d; r.x2 += d;
    } else {
      const d = Math.abs(a.rect.y1 - r.y2) < Math.abs(a.rect.y2 - r.y1)
        ? a.rect.y1 - r.y2 : a.rect.y2 - r.y1;
      r.y1 += d; r.y2 += d;
    }
    adjusted.push(`${b.name} slid clear of ${a.name}`);
  }

  // A stairwell cannot change size, so it steps along its own corridor to the
  // nearest slot that clears EVERYTHING. Dodging one neighbour at a time just
  // walks it into the next.
  function slideStair(s) {
    const r = s.rect, w = r.x2 - r.x1, h = r.y2 - r.y1;
    const base = s.axis === 'h' ? r.x1 : r.y1;
    const others = [...ROOMS.map(x => x.rect), ...HALLS,
                    ...STAIRS.filter(x => x !== s).map(x => x.rect)];
    for (let step = 0; step <= 420; step += 6) {
      for (const dir of (step ? [-1, 1] : [0])) {
        const at = base + dir * step;
        const cand = s.axis === 'h'
          ? { x1:at, x2:at + w, y1:r.y1, y2:r.y2 }
          : { x1:r.x1, x2:r.x2, y1:at, y2:at + h };
        if (others.some(o => hits(cand, o))) continue;
        Object.assign(r, cand);
        return step > 0;
      }
    }
    return false;
  }

  // Mirror a room across the corridor its door opens onto.
  function flipSide(r) {
    const q = r.rect;
    if (r.segAxis === 'v') { const x1 = 2 * r.segPos - q.x2, x2 = 2 * r.segPos - q.x1; q.x1 = x1; q.x2 = x2; }
    else                   { const y1 = 2 * r.segPos - q.y2, y2 = 2 * r.segPos - q.y1; q.y1 = y1; q.y2 = y2; }
    r.onLine = false;   // only ever worth trying once
    return true;
  }

  // A stairwell straddling a corridor that crosses its own moves off it first.
  for (const s of STAIRS) {
    if (HALLS.some(h => hits(s.rect, h)) && slideStair(s)) {
      adjusted.push(`${s.name} slid clear of a crossing corridor`);
    }
  }

  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    // A corridor is never negotiable: a room overlapping one gets cut back.
    for (const r of ROOMS) for (const h of HALLS) {
      if (hits(r.rect, h) && shrinkAway(r, { rect: h })) {
        adjusted.push(`${r.name} cut back off a corridor`); moved = true;
      }
    }
    for (const s of STAIRS) for (const r of ROOMS) {
      if (!hits(s.rect, r.rect)) continue;
      if (shrinkAway(r, s)) {
        adjusted.push(`${r.name} pulled clear of ${s.name}`); moved = true;
      } else if (r.onLine && flipSide(r)) {
        // The door sat exactly on the corridor centreline, so which side the
        // room lies on was a guess. It was the wrong one.
        adjusted.push(`${r.name} moved to the other side of its corridor`); moved = true;
      } else if (slideStair(s)) {
        adjusted.push(`${s.name} slid clear of ${r.name}`); moved = true;
      }
    }
    for (let i = 0; i < ROOMS.length; i++) for (let j = i + 1; j < ROOMS.length; j++) {
      if (!hits(ROOMS[i].rect, ROOMS[j].rect)) continue;
      if (shrinkAway(ROOMS[i], ROOMS[j]) || shrinkAway(ROOMS[j], ROOMS[i])) {
        adjusted.push(`${ROOMS[i].name} / ${ROOMS[j].name} separated`); moved = true;
      }
    }
    if (!moved) break;
  }

  // ── checks ─────────────────────────────────────────────────────────────────
  const problems = [];
  const placed = [...ROOMS, ...STAIRS];
  for (const p of placed) {
    HALLS.forEach((h, i) => { if (hits(p.rect, h)) problems.push(`${p.name} blocks hall ${SEGS[i].id}`); });
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    if (hits(placed[i].rect, placed[j].rect)) problems.push(`${placed[i].name} overlaps ${placed[j].name}`);
  }
  for (const r of ROOMS) for (const d of r.doors) {
    if (!(d[0] >= r.rect.x1 - 70 && d[0] <= r.rect.x2 + 70 &&
          d[1] >= r.rect.y1 - 70 && d[1] <= r.rect.y2 + 70)) {
      problems.push(`${r.name}: door ${d} is not on its own wall`);
    }
  }
  const missing = ROOM_LABELS[FLOOR].filter(n => !ROOMS.some(r => r.name === n));
  if (missing.length) problems.push(`rooms never placed: ${missing.join(', ')}`);

  const bbox = placed.reduce((b, r) => ({
    x1: Math.min(b.x1, r.rect.x1), y1: Math.min(b.y1, r.rect.y1),
    x2: Math.max(b.x2, r.rect.x2), y2: Math.max(b.y2, r.rect.y2),
  }), { x1:1e9, y1:1e9, x2:-1e9, y2:-1e9 });

  return { floor:FLOOR, ROOMS, STAIRS, DOORS, HALLS, bbox, problems, adjusted };
}

module.exports = { buildFloor, stairDepthLimit };
