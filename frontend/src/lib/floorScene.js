import PLANS from './floorPlans.json';

/* ─────────────────────────────────────────────────────────────────────────
   Turns a baked floor plan into three.js geometry.

   Used by the /model page. The Route Finder draws on the scanned plans
   instead (lib/floorMaps.js).

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

  function dispose() {
    junk.forEach((d) => d.dispose && d.dispose());
    junk.length = 0;
  }

  return { mats, buildFloor, label, box, dispose, track: (d) => junk.push(d) };
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
