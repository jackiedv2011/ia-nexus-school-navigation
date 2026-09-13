import PLANS from './floorPlans.json';

/* ─────────────────────────────────────────────────────────────────────────
   Turns a baked floor plan into three.js geometry.

   Shared by the /model page (which shows a whole floor) and the route map
   (which shows one floor with a walk drawn on it), so the building looks the
   same wherever it appears and the geometry only exists once.

   The plans come from backend/scripts/buildFloorPlans.js, which derives them
   from roomCoordinates.js — the same corridors, doorways and stair landings
   the pathfinder walks. Room outlines are inferred: the plans record where
   doors ARE, never where walls run.
   ───────────────────────────────────────────────────────────────────────── */

export { PLANS };

export const M_PER_PX = 140 / 2448;   // the scale the router measures in
export const S = 0.028;               // blueprint px -> world units
export const WALL_H = 1.5;
export const WT = 5;                  // half wall thickness, in blueprint px
export const DOOR_HALF = 26;          // half a doorway opening
export const HALL_HALF = 23;

export const COL = {
  room: 0xc9d8e8, lib: 0xbfd8c6, stair: 0xe8d5b7, hall: 0x8d9aa6,
  wall: 0xf3f1ec, door: 0xe0a253, slab: 0x4f5b66,
  path: 0xb0252a, start: 0x16a34a, end: 0xdc2626,
};

export const isLib = (n) => /xchange/i.test(n);
export const areaOf = (q) => Math.round((q.x2 - q.x1) * (q.y2 - q.y1) * M_PER_PX * M_PER_PX);

// Every floor shares one origin, so switching between them doesn't shift the
// view and a route on floor 1 sits where floor 1 actually is.
const UNION = [1, 2, 3].reduce((u, f) => {
  const b = PLANS[f].bbox;
  return {
    x1: Math.min(u.x1, b.x1), y1: Math.min(u.y1, b.y1),
    x2: Math.max(u.x2, b.x2), y2: Math.max(u.y2, b.y2),
  };
}, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });

export const CX = (UNION.x1 + UNION.x2) / 2;
export const CY = (UNION.y1 + UNION.y2) / 2;
export const wx = (p) => (p - CX) * S;
export const wz = (p) => (p - CY) * S;

// The four walls of a rectangle, each with the direction its room lies in.
function sidesOf(q) {
  return [
    { horiz: true,  fixed: q.y1, a: q.x1, b: q.x2, inward:  1 },
    { horiz: true,  fixed: q.y2, a: q.x1, b: q.x2, inward: -1 },
    { horiz: false, fixed: q.x1, a: q.y1, b: q.y2, inward:  1 },
    { horiz: false, fixed: q.x2, a: q.y1, b: q.y2, inward: -1 },
  ];
}

/** Bounds of a walk, in blueprint coordinates — cheap, no geometry built. */
export function routeBBox(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    x1: Math.min(...xs), x2: Math.max(...xs),
    y1: Math.min(...ys), y2: Math.max(...ys),
  };
}

/**
 * A builder bound to one three.js module and one set of materials.
 * Call dispose() when the scene goes away — every geometry, material and
 * texture it created is tracked so nothing leaks between mounts.
 */
export function createFloorKit(THREE) {
  const mats = {
    wall:   new THREE.MeshStandardMaterial({ color: COL.wall,  roughness: 0.94 }),
    hall:   new THREE.MeshStandardMaterial({ color: COL.hall,  roughness: 0.9 }),
    door:   new THREE.MeshStandardMaterial({ color: COL.door,  roughness: 0.55 }),
    stair:  new THREE.MeshStandardMaterial({ color: COL.stair, roughness: 0.85 }),
    slab:   new THREE.MeshStandardMaterial({ color: COL.slab,  roughness: 0.96 }),
    arc:    new THREE.MeshBasicMaterial({ color: 0xf0b263, transparent: true, opacity: 0.95 }),
    nosing: new THREE.MeshBasicMaterial({ color: 0x8d7a58 }),
    path:   new THREE.MeshBasicMaterial({ color: COL.path }),
  };
  const junk = [...Object.values(mats)];

  function box(g, x1, y1, x2, y2, h, yBase, mat, shadow) {
    const w = Math.abs(wx(x2) - wx(x1));
    const d = Math.abs(wz(y2) - wz(y1));
    const geo = new THREE.BoxGeometry(w || 0.01, h, d || 0.01);
    junk.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((wx(x1) + wx(x2)) / 2, yBase + h / 2, (wz(y1) + wz(y2)) / 2);
    m.receiveShadow = true;
    if (shadow) m.castShadow = true;
    g.add(m);
    return m;
  }

  /* ── Name plates ────────────────────────────────────────────────────────
     Dark, spaced and bold on a near-white plate: the map is a dark scene and
     white lettering on it was hard to read.

     Each plate is drawn at a fixed design resolution and the canvas is CUT TO
     THE TEXT, so the sprite carries no empty margin and its footprint on the
     map is exactly the plate you see. That is what lets a plate be made as
     large as its own room can hold and no larger — which is the only way a
     name can be big and still not cover the door, the stair or the room next
     to it. */
  const FONT_PX = 150;                 // design resolution, not a screen size
  const PAD_X = 44, PAD_Y = 24, LINE_H = 1.12, RADIUS = 20;
  const fontOf = (px) => `800 ${px}px "Avenir Next", Helvetica, Arial, sans-serif`;

  // One context, only ever used to measure.
  const ruler = document.createElement('canvas').getContext('2d');
  function measure(lines) {
    ruler.letterSpacing = '6px';       // ignored where unsupported, which costs
    ruler.font = fontOf(FONT_PX);      // nothing but the spacing
    const textW = Math.max(...lines.map((l) => ruler.measureText(l).width));
    return {
      w: Math.ceil(textW + PAD_X * 2),
      h: Math.ceil(lines.length * FONT_PX * LINE_H + PAD_Y * 2),
    };
  }

  /** The ways a name can be broken across lines. */
  function layoutsOf(text) {
    if (isLib(text)) return [['XCHANGE', 'LIBRARY']];
    const out = [[text]];
    const parts = text.split(/\s+/).filter(Boolean);
    // "STAIR 1" over two lines is nearly square, and a nearly square plate
    // fits a nearly square stairwell far better than a long thin one does.
    if (parts.length > 1) out.push([parts[0], parts.slice(1).join(' ')]);
    return out;
  }

  function draw(lines, size, turned) {
    const cv = document.createElement('canvas');
    cv.width = turned ? size.h : size.w;
    cv.height = turned ? size.w : size.h;
    const c = cv.getContext('2d');
    if (turned) {
      // Reading upward, the way a long thin room is labelled on a real plan.
      c.translate(0, cv.height);
      c.rotate(-Math.PI / 2);
    }
    c.letterSpacing = '6px';
    c.font = fontOf(FONT_PX);

    const r = RADIUS, ins = 3;
    const x0 = ins, y0 = ins, x1 = size.w - ins, y1 = size.h - ins;
    c.beginPath();
    c.moveTo(x0 + r, y0);
    c.arcTo(x1, y0, x1, y1, r);
    c.arcTo(x1, y1, x0, y1, r);
    c.arcTo(x0, y1, x0, y0, r);
    c.arcTo(x0, y0, x1, y0, r);
    c.closePath();
    c.fillStyle = 'rgba(247,249,251,.97)';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(11,16,22,.6)';
    c.stroke();

    c.fillStyle = '#0b1016';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const lh = FONT_PX * LINE_H;
    lines.forEach((l, i) => c.fillText(l, size.w / 2, size.h / 2 + (i - (lines.length - 1) / 2) * lh));

    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8;                // the plates are heavily minified
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    junk.push(tex, mat);
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 20;
    return sp;
  }

  /**
   * The biggest plate for `text` that fits in `fitW` x `fitH` world units.
   *
   * `h` is the plate's THICKNESS across the lines of text — the thing that
   * decides how big the letters come out — so it compares fairly between a
   * plate laid flat and one turned on its side. A long thin room gets its
   * name running along it rather than a plate too small to read.
   *
   * `minH` is a legibility floor: a handful of rooms are barely wider than
   * their own walls, and a name too small to read serves nobody, so those
   * few spill over rather than disappear.
   *
   * Returns the sprite with the map footprint it was given, so a caller that
   * has to find somewhere to put it knows how much room it needs.
   */
  function plateFor(text, {
    maxH = 2.0, minH = 0, fitW = Infinity, fitH = Infinity, turnable = true,
  } = {}) {
    let best = null;
    for (const lines of layoutsOf(text)) {
      const size = measure(lines);
      const aspect = size.w / size.h;
      const flat = Math.min(maxH, fitH, fitW / aspect);
      if (!best || flat > best.h) best = { lines, size, aspect, h: flat, turned: false };
      if (!turnable) continue;
      const turned = Math.min(maxH, fitW, fitH / aspect);
      if (turned > best.h) best = { lines, size, aspect, h: turned, turned: true };
    }
    const h = Math.max(best.h, minH);
    const sp = draw(best.lines, best.size, best.turned);
    const long = h * best.aspect;
    const w = best.turned ? h : long;
    const d = best.turned ? long : h;
    sp.scale.set(w, d, 1);
    return { sprite: sp, w, h: d };
  }

  /**
   * A room's name, as large as the room itself can carry. `fill` leaves a
   * margin inside the walls so the plate never touches them.
   */
  function label(text, q, { y = WALL_H + 1.0, maxH = 2.0, fill = 0.88, minH = 0.9 } = {}) {
    const roomW = Math.abs(wx(q.x2) - wx(q.x1));
    const roomD = Math.abs(wz(q.y2) - wz(q.y1));
    const { sprite } = plateFor(text, { maxH, minH, fitW: roomW * fill, fitH: roomD * fill });
    sprite.position.set((wx(q.x1) + wx(q.x2)) / 2, y, (wz(q.y1) + wz(q.y2)) / 2);
    return sprite;
  }

  /** One floor: slab, corridors, rooms with pierced walls and hung doors, stairs. */
  function buildFloor(plan, { withLabels = true } = {}) {
    const group = new THREE.Group();
    const walls = new THREE.Group();
    const labels = new THREE.Group();
    const halls = new THREE.Group();
    group.add(walls, labels, halls);
    const pickables = [];

    const b = plan.bbox, pad = 60;
    box(group, b.x1 - pad, b.y1 - pad, b.x2 + pad, b.y2 + pad, 0.4, -0.4, mats.slab, false);

    plan.HALLS.forEach((h) => {
      const m = box(halls, h.x1, h.y1, h.x2, h.y2, 0.06, 0, mats.hall, false);
      m.userData = { name: 'Hallway', sub: 'open corridor' };
      pickables.push(m);
    });
    // the short link from a doorway or landing onto its corridor, same width
    const link = (p, f) => {
      if (Math.abs(f[0] - p[0]) + Math.abs(f[1] - p[1]) < 6) return;
      let [x1, x2] = [Math.min(p[0], f[0]), Math.max(p[0], f[0])];
      let [y1, y2] = [Math.min(p[1], f[1]), Math.max(p[1], f[1])];
      if (x2 - x1 < y2 - y1) { x1 -= HALL_HALF; x2 += HALL_HALF; }
      else                   { y1 -= HALL_HALF; y2 += HALL_HALF; }
      box(halls, x1, y1, x2, y2, 0.06, 0, mats.hall, false);
    };
    plan.DOORS.forEach((d) => link(d.at, d.foot));
    plan.STAIRS.forEach((s) => link(s.landing, s.foot));

    const run = (s, a, bb) => {
      if (bb - a < 0.5) return;
      if (s.horiz) box(walls, a, s.fixed - WT, bb, s.fixed + WT, WALL_H, 0.06, mats.wall, true);
      else         box(walls, s.fixed - WT, a, s.fixed + WT, bb, WALL_H, 0.06, mats.wall, true);
    };
    // the lintel over an opening, so a wall still reads as continuous
    const header = (s, a, bb) => {
      const y = 0.06 + WALL_H - 0.2;
      if (s.horiz) box(walls, a, s.fixed - WT, bb, s.fixed + WT, 0.2, y, mats.wall, true);
      else         box(walls, s.fixed - WT, a, s.fixed + WT, bb, 0.2, y, mats.wall, true);
    };

    // a real door: the leaf standing open at 90°, plus its swing arc
    function leaf(s, a, bb) {
      const w = bb - a, dir = s.inward, f = s.fixed;
      const hx = s.horiz ? a : f;
      const hz = s.horiz ? f : a;
      const p1 = s.horiz ? [a - 3, f] : [f, a - 3];
      const p2 = s.horiz ? [a + 3, f + dir * w] : [f + dir * w, a + 3];
      box(group, Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]),
                 Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1]),
          WALL_H - 0.3, 0.06, mats.door, true);

      const r = Math.abs(w) * S;
      const geo = new THREE.RingGeometry(r - 0.045, r, 40, 1, 0, Math.PI / 2);
      junk.push(geo);
      const arc = new THREE.Mesh(geo, mats.arc);
      arc.rotation.x = -Math.PI / 2;
      arc.position.set(wx(hx), 0.135, wz(hz));
      // turn the quarter so it runs from the open leaf round to the jamb
      const tip    = s.horiz ? [wx(hx), wz(f + dir * w)] : [wx(f + dir * w), wz(hz)];
      const closed = s.horiz ? [wx(bb), wz(f)]           : [wx(f), wz(bb)];
      const A = Math.atan2(-(tip[1] - wz(hz)), tip[0] - wx(hx));
      const C = Math.atan2(-(closed[1] - wz(hz)), closed[0] - wx(hx));
      const turn = (((C - A) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      arc.rotation.z = turn > Math.PI ? C : A;
      group.add(arc);
    }

    function shell(q, doors, withLeaves) {
      const sides = sidesOf(q);
      // a doorway pierces exactly one wall — the nearest
      const owned = sides.map(() => []);
      (doors || []).forEach((d) => {
        let best = 0, bd = Infinity;
        sides.forEach((s, i) => {
          const across = s.horiz ? d[1] : d[0];
          const along = s.horiz ? d[0] : d[1];
          const over = Math.max(s.a - along, along - s.b, 0);
          const dist = Math.abs(across - s.fixed) + over * 2;
          if (dist < bd) { bd = dist; best = i; }
        });
        owned[best].push(d);
      });
      sides.forEach((s, i) => {
        const gaps = owned[i]
          .map((d) => {
            const along = s.horiz ? d[0] : d[1];
            const c = Math.min(Math.max(along, s.a + DOOR_HALF), s.b - DOOR_HALF);
            return [c - DOOR_HALF, c + DOOR_HALF];
          })
          .sort((p, n) => p[0] - n[0]);
        let cur = s.a;
        gaps.forEach((gp) => {
          if (gp[0] > cur) run(s, cur, gp[0]);
          header(s, gp[0], gp[1]);
          if (withLeaves) leaf(s, gp[0], gp[1]);
          cur = Math.max(cur, gp[1]);
        });
        if (cur < s.b) run(s, cur, s.b);
      });
    }

    plan.ROOMS.forEach((r) => {
      const q = r.rect;
      const mat = new THREE.MeshStandardMaterial({
        color: isLib(r.name) ? COL.lib : COL.room, roughness: 0.92,
      });
      junk.push(mat);
      const m = box(group, q.x1, q.y1, q.x2, q.y2, 0.09, 0.01, mat, false);
      m.userData = {
        name: r.name, room: r.name,
        sub: `${areaOf(q)} m² · ${r.doors.length} ${r.doors.length === 1 ? 'doorway' : 'doorways'}`,
      };
      pickables.push(m);
      shell(q, r.doors, true);
      if (withLabels) labels.add(label(r.name, q));
    });

    plan.STAIRS.forEach((s) => {
      const q = s.rect;
      const m = box(group, q.x1, q.y1, q.x2, q.y2, 0.09, 0.01, mats.stair, false);
      m.userData = { name: s.name, sub: 'connects to other floors' };
      pickables.push(m);
      shell(q, [s.landing], true);

      const inset = 16, treads = 9;
      const x1 = q.x1 + inset, x2 = q.x2 - inset;
      const y1 = q.y1 + inset, y2 = q.y2 - inset;
      const alongY = y2 - y1 >= x2 - x1;
      for (let i = 0; i < treads; i += 1) {
        const t0 = i / treads, t1 = (i + 1) / treads;
        const h = 0.1 + (s.side > 0 ? treads - i : i + 1) * 0.05;
        if (alongY) box(group, x1, y1 + (y2 - y1) * t0, x2, y1 + (y2 - y1) * t1, h, 0.1, mats.stair, true);
        else        box(group, x1 + (x2 - x1) * t0, y1, x1 + (x2 - x1) * t1, y2, h, 0.1, mats.stair, true);
        // a nosing, so treads read as steps from straight above
        if (i > 0) {
          const e = 3.5;
          if (alongY) box(group, x1, y1 + (y2 - y1) * t0 - e, x2, y1 + (y2 - y1) * t0 + e, 0.02, 0.1 + h, mats.nosing, false);
          else        box(group, x1 + (x2 - x1) * t0 - e, y1, x1 + (x2 - x1) * t0 + e, y2, 0.02, 0.1 + h, mats.nosing, false);
        }
      }
      if (withLabels) labels.add(label(s.name.toUpperCase(), q));
    });

    return { group, pickables, walls, labels, halls };
  }

  /**
   * The walk itself, laid over the floor: a ribbon along the waypoints with a
   * marker at each end. `points` are blueprint coordinates straight from the
   * router, so what you see is exactly the path it computed.
   */
  function buildRoute(points, [startText, endText] = ['Start', 'Destination'], { zoom = 1, plan = null } = {}) {
    const group = new THREE.Group();
    if (!Array.isArray(points) || points.length < 2) return { group, bbox: null };

    // `zoom` is how far the camera ends up sitting back. The walk has to read at
    // a glance whether it crosses the whole building or hops next door, so the
    // ribbon and its markers grow with that distance instead of vanishing.
    const W = Math.max(9, Math.min(14, 7 * zoom));   // ribbon half-width, blueprint px
    const Y = 0.16;                    // just clear of the floor and the door arcs
    for (let i = 1; i < points.length; i += 1) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      if (ax === bx && ay === by) continue;
      box(group, Math.min(ax, bx) - W, Math.min(ay, by) - W,
                 Math.max(ax, bx) + W, Math.max(ay, by) + W, 0.05, Y, mats.path, false);
    }

    /* Where to put a marker's name.

       A room's name has a room to sit in. "You are here" has nothing — it
       belongs to a point, and whatever it is laid over it hides. So rather
       than always stepping north or south and hoping, try the ways round the
       dot and keep the one that covers the least: corridor floor is free,
       a room or a stairwell is not, and off the building entirely is worse
       than either. If nothing is clear, the plate shrinks and tries again. */
    const blocked = [];
    if (plan) {
      plan.ROOMS.forEach((r) => blocked.push(r.rect));
      plan.STAIRS.forEach((t) => blocked.push(t.rect));
    }
    const overlap = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1))
                            * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

    // Straight up first — a name reads best above the thing it names — then
    // the other seven, then further out.
    const WAYS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];

    function placeAt(p, wWorld, hWorld, gapWorld) {
      const halfW = (wWorld / S) / 2, halfH = (hWorld / S) / 2;   // blueprint px
      const gap = gapWorld / S;
      let best = null;
      for (const reach of [1, 1.6, 2.4]) {
        for (const [dx, dy] of WAYS) {
          const d = reach * gap;
          // Diagonals step by the plate's own half-size so the corner clears.
          const cx = p[0] + dx * (d + (dx ? halfW : 0));
          const cy = p[1] + dy * (d + (dy ? halfH : 0));
          const rect = { x1: cx - halfW, x2: cx + halfW, y1: cy - halfH, y2: cy + halfH };
          let cost = 0;
          for (const b of blocked) cost += overlap(rect, b);
          if (plan) {
            // Hanging off the edge of the building reads as a mistake.
            const f = plan.bbox;
            const outside = (halfW * 2) * (halfH * 2) - overlap(rect, f);
            cost += outside * 1.5;
          }
          // All else equal, nearer and higher wins.
          cost += reach * 40 + (dy > 0 ? 30 : 0) + (dx ? 20 : 0);
          if (!best || cost < best.cost) best = { cost, cx, cy, clear: cost < reach * 40 + 60 };
        }
        if (best && best.clear) break;
      }
      return best;
    }

    const marker = (p, color, text) => {
      const r = Math.max(0.3, Math.min(0.42, 0.2 * zoom));
      const geo = new THREE.SphereGeometry(r, 20, 14);
      const mat = new THREE.MeshBasicMaterial({ color });
      junk.push(geo, mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(wx(p[0]), Y + r, wz(p[1]));
      m.renderOrder = 18;
      group.add(m);

      // Sized like a room name, never bigger: the ends of the walk matter,
      // but not more than the rooms and doors around them.
      let made = plateFor(text, { maxH: 1.9, turnable: false });
      let spot = placeAt(p, made.w, made.h, r + 0.25);
      if (spot && !spot.clear) {
        // Nowhere clear at full size — a smaller plate hides less.
        const smaller = plateFor(text, { maxH: 1.25, turnable: false });
        const alt = placeAt(p, smaller.w, smaller.h, r + 0.2);
        if (alt && (alt.clear || alt.cost < spot.cost)) {
          made.sprite.material.map.dispose();
          made.sprite.material.dispose();
          made = smaller; spot = alt;
        } else {
          smaller.sprite.material.map.dispose();
          smaller.sprite.material.dispose();
        }
      }
      const plate = made.sprite;
      plate.position.set(wx(spot ? spot.cx : p[0]), Y + r + made.h * 0.7, wz(spot ? spot.cy : p[1]));
      // Above the room names. Both are depth-test-free sprites, so without this
      // three.js sorts them by distance and a room plate — which floats higher —
      // paints over the route's own label.
      plate.renderOrder = 24;
      group.add(plate);
    };
    marker(points[0], COL.start, startText);
    marker(points[points.length - 1], COL.end, endText);

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const bbox = {
      x1: Math.min(...xs), x2: Math.max(...xs),
      y1: Math.min(...ys), y2: Math.max(...ys),
    };
    return { group, bbox };
  }

  function dispose() {
    junk.forEach((d) => d.dispose && d.dispose());
    junk.length = 0;
  }

  return { mats, buildFloor, buildRoute, label, box, dispose, track: (d) => junk.push(d) };
}

/** Lights that suit these plans, added to a scene. */
export function addLights(THREE, scene) {
  scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x2a3138, 0.74));
  const sun = new THREE.DirectionalLight(0xfff3e0, 0.6);
  sun.position.set(22, 52, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sd = 46;
  Object.assign(sun.shadow.camera, { left: -sd, right: sd, top: sd, bottom: -sd, far: 170 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9db6cc, 0.24);
  fill.position.set(-34, 22, -14);
  scene.add(fill);
}

/* ── One camera, shared by every map ──────────────────────────────────────
   The route map and the pin picker have to look like the same building seen
   the same way, so the framing, the opening angle and the controls live here
   rather than in either component. */

export const FOV = 45;
const TAN = Math.tan((FOV / 2) * (Math.PI / 180));

/**
 * How far back a camera looking straight down must sit to hold `b` (a
 * blueprint-space rectangle) in a frame of the given aspect, with `pad` of the
 * rectangle's own size as margin and at least `floorPad` of it.
 *
 * The real aspect of the element is passed in rather than assumed: the maps
 * don't zoom, so whatever this returns is the whole view a student gets, and
 * it has to hold the entire floor at every window size.
 */
export function frameOn(b, { pad = 0.06, floor: floorPad = 3, aspect = 1.6 } = {}) {
  const cx = (wx(b.x1) + wx(b.x2)) / 2;
  const cz = (wz(b.y1) + wz(b.y2)) / 2;
  const spanX = Math.abs(wx(b.x2) - wx(b.x1));
  const spanZ = Math.abs(wz(b.y2) - wz(b.y1));
  // The margin also has to hold what hangs off the building: a Start marker on
  // a room at the very edge carries a name plate wider than the room.
  const padX = Math.max(spanX * pad, floorPad);
  const padZ = Math.max(spanZ * pad, floorPad);
  const r = Math.max(
    (spanZ / 2 + padZ) / TAN,
    (spanX / 2 + padX) / (TAN * Math.max(aspect, 0.2)),
  );
  return { cx, cz, r, spanX, spanZ };
}

/**
 * Turning a map. It opens straight down — the way a floor plan is read — and
 * drags into the 3D model from there.
 *
 * There is no zoom, by design: the frame always holds the whole floor, so
 * there is nothing to zoom out to find and nothing to get lost in. The
 * distance is set by the frame, not the student.
 *
 * `onTap` makes the map clickable: it is handed the point on the floor in
 * blueprint coordinates, and only fires for a press that did not turn into a
 * drag, so placing a pin and turning the building don't fight each other.
 */
export function orbitCamera(THREE, el, camera, fit, { keys = true, keyEl = el, onTap = null } = {}) {
  const target = new THREE.Vector3(fit.cx, 0.3, fit.cz);
  const sph = { r: fit.r, theta: Math.PI / 2, phi: 0.03 };

  function apply() {
    sph.phi = Math.max(0.02, Math.min(1.5, sph.phi));
    camera.position.set(
      target.x + sph.r * Math.sin(sph.phi) * Math.cos(sph.theta),
      target.y + sph.r * Math.cos(sph.phi),
      target.z + sph.r * Math.sin(sph.phi) * Math.sin(sph.theta),
    );
    camera.lookAt(target);
  }

  // Where a screen point lands on the floor, in blueprint coordinates. Cast
  // against the plane the rooms are drawn on, so it stays exact however the
  // building has been turned.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
  const ray = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  function floorPoint(clientX, clientY) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ray.setFromCamera(new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    ), camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return [hit.x / S + CX, hit.z / S + CY];
  }

  let drag = null;
  const pointers = {};

  const onDown = (e) => {
    el.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = true;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
  };
  const onMove = (e) => {
    // A second finger would be a pinch, and there is nothing to pinch.
    if (!drag || Object.keys(pointers).length > 1) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    sph.theta += dx * 0.006;
    sph.phi -= dy * 0.006;
    apply();
  };
  const release = (e) => {
    // A press that never really moved is a tap, not a drag — 4px of slop, so a
    // finger that shifts slightly still counts as a tap.
    if (onTap && drag && Object.keys(pointers).length === 1
        && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) <= 4) {
      const p = floorPoint(e.clientX, e.clientY);
      if (p) onTap(p[0], p[1]);
    }
    delete pointers[e.pointerId];
    if (!Object.keys(pointers).length) drag = null;
  };
  const onCtx = (e) => e.preventDefault();
  // The map is a figure, but turning it should not need a mouse. No zoom keys:
  // there is no zoom.
  const onKey = (e) => {
    const step = 0.12;
    if (e.key === 'ArrowLeft') sph.theta -= step;
    else if (e.key === 'ArrowRight') sph.theta += step;
    else if (e.key === 'ArrowUp') sph.phi -= step;
    else if (e.key === 'ArrowDown') sph.phi += step;
    else return;
    e.preventDefault();
    apply();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', onCtx);
  // Keys go to whatever element actually takes focus, which is usually the
  // frame around the canvas rather than the canvas itself.
  if (keys) keyEl.addEventListener('keydown', onKey);
  apply();

  return {
    apply,
    /** Re-fit after a resize, keeping whatever angle the student has turned to. */
    reframe(next) {
      target.set(next.cx, 0.3, next.cz);
      sph.r = next.r;
      apply();
    },
    detach() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('contextmenu', onCtx);
      if (keys) keyEl.removeEventListener('keydown', onKey);
    },
  };
}
