import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import PLANS from './floorPlans.json';
import OUTLINES from './roomOutlines.json';
import WALKS from './walkEdges.json';
import { M_PER_PX, S, PXM, UM, WALL_H, WALL_M, FY } from './scene/units.js';
import { Geo } from './scene/geo.js';
import { makeTextures, makeAtlas, courtTexture, rng, hashStr, pick } from './scene/textures.js';
import { makePrefabs } from './scene/props.js';

/* ─────────────────────────────────────────────────────────────────────────
   Turns a baked floor plan into a furnished, lit three.js interior.

   Shared by the /model page (which shows a whole floor) and the route map
   (which shows one floor with a walk drawn on it), so the building looks the
   same wherever it appears and the geometry only exists once.

   The plans come from backend/scripts/buildFloorPlans.js, which derives them
   from roomCoordinates.js — the same corridors, doorways and stair landings
   the pathfinder walks. Nothing here moves a wall, a door or a corridor: the
   layout is the router's, and everything added — furniture, lockers, signs,
   ceilings — is dressing placed inside it, kept clear of every doorway.

   Scale: 1 world unit ≈ 2.04 m, so walls are 3.06 m, doors 2.1 m, desks
   0.73 m. Furniture is modelled in metres in scene/props.js.
   ───────────────────────────────────────────────────────────────────────── */

export { PLANS, M_PER_PX, S, WALL_H, FY };

export const WT = 2.6;                        // half wall thickness, blueprint px (0.3 m walls)
export const DOOR_HALF = 0.5 * PXM;           // a single classroom door (≈1 m opening)
const DOOR_WIDE = 0.95 * PXM;                 // double doors: gym, library, stairwells
export const HALL_HALF = 23;

export const COL = {
  room: 0xc9d8e8, lib: 0xbfd8c6, stair: 0xe8d5b7, hall: 0x8d9aa6,
  wall: 0xf3f1ec, door: 0xe0a253, slab: 0x4f5b66,
  path: 0xd42a2f, start: 0x16a34a, end: 0xdc2626,
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

const TOP = FY + WALL_H;
const CAP = '#30353b';                        // wall tops, read as the plan's cut line
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CHAIR_COLS = ['#2f5d8a', '#c0552b', '#3f7a4f', '#6b6f75', '#8a2f36', '#d49a2a', '#2a6f77'];
const LOCKER_COLS = ['#8f1d22', '#2f4f7a', '#6b7178', '#9aa3ad', '#8f1d22'];
const WALL_MOUNTED = new Set(['locker', 'fountain', 'extinguisher', 'pull', 'exitBox', 'projector',
  'wbFrame', 'wbTray', 'tvBody', 'jamb', 'head', 'winFrame', 'hoop', 'leaf', 'rail', 'post']);

// The four walls of a rectangle, each with the direction its room lies in.
function sidesOf(q) {
  return [
    { horiz: true,  fixed: q.y1, a: q.x1, b: q.x2, inward:  1 },
    { horiz: true,  fixed: q.y2, a: q.x1, b: q.x2, inward: -1 },
    { horiz: false, fixed: q.x1, a: q.y1, b: q.y2, inward:  1 },
    { horiz: false, fixed: q.x2, a: q.y1, b: q.y2, inward: -1 },
  ];
}

// Which wall a doorway pierces: the nearest one.
function nearestSide(sides, d) {
  let best = 0, bd = Infinity;
  sides.forEach((s, i) => {
    const across = s.horiz ? d[1] : d[0];
    const along = s.horiz ? d[0] : d[1];
    const over = Math.max(s.a - along, along - s.b, 0);
    const dist = Math.abs(across - s.fixed) + over * 2;
    if (dist < bd) { bd = dist; best = i; }
  });
  return best;
}

// The wall a doorway really pierces: the one the router's approach (from
// `foot`, on the corridor, to `pt`) crosses. Distance alone is ambiguous
// for a landing in the middle of a stairwell.
function crossedSide(sides, pt, foot) {
  if (!foot || Math.hypot(foot[0] - pt[0], foot[1] - pt[1]) < 3) return -1;
  return sides.findIndex((s) => {
    const a = s.horiz ? pt[1] : pt[0], b = s.horiz ? foot[1] : foot[0];
    const al = s.horiz ? pt[0] : pt[1];
    return (a - s.fixed) * (b - s.fixed) <= 0 && al >= s.a - 6 && al <= s.b + 6;
  });
}
function doorSide(sides, pt, foot) {
  const i = crossedSide(sides, pt, foot);
  return i >= 0 ? i : nearestSide(sides, pt);
}
const footOf = (plan, pt) => {
  const d = plan.DOORS.find((o) => Math.abs(o.at[0] - pt[0]) < 2 && Math.abs(o.at[1] - pt[1]) < 2);
  if (d) return d.foot;
  const st = plan.STAIRS.find((o) => Math.abs(o.landing[0] - pt[0]) < 2 && Math.abs(o.landing[1] - pt[1]) < 2);
  return st ? st.foot : null;
};

function kindOf(name, q) {
  const w = (q.x2 - q.x1) / PXM, d = (q.y2 - q.y1) / PXM;
  const mn = Math.min(w, d), mx = Math.max(w, d);
  if (/^gym$/i.test(name)) return 'gym';
  if (isLib(name)) return 'library';
  if (/courtyard/i.test(name)) return 'courtyard';
  if (/clinic/i.test(name)) return 'clinic';
  if (/reception/i.test(name)) return 'reception';
  if (/mission control/i.test(name)) return 'conference';
  if (/hangar/i.test(name)) return 'maker';
  if (mn < 2.8) return mx >= 6 ? 'narrow' : 'closet';
  if (/lab/i.test(name)) return 'lab';
  return 'classroom';
}

// A rectangle with holes cut out of it, as a list of rectangles.
function rectSubtract(r, holes) {
  let out = [r];
  holes.forEach((h) => {
    const next = [];
    out.forEach((q) => {
      if (h.x2 <= q.x1 || h.x1 >= q.x2 || h.y2 <= q.y1 || h.y1 >= q.y2) { next.push(q); return; }
      if (h.y1 > q.y1) next.push({ x1: q.x1, x2: q.x2, y1: q.y1, y2: h.y1 });
      if (h.y2 < q.y2) next.push({ x1: q.x1, x2: q.x2, y1: h.y2, y2: q.y2 });
      const y1 = Math.max(q.y1, h.y1), y2 = Math.min(q.y2, h.y2);
      if (h.x1 > q.x1) next.push({ x1: q.x1, x2: h.x1, y1, y2 });
      if (h.x2 < q.x2) next.push({ x1: h.x2, x2: q.x2, y1, y2 });
    });
    out = next;
  });
  return out;
}

/**
 * A wall-aligned frame: u runs along a wall face, v runs away from it into
 * the space, both in metres. `P(u, v)` gives blueprint px; `yaw` turns a
 * prefab so its front faces away from the wall.
 */
function frameOf(sd, depthPx) {
  const n = sd.horiz ? [0, sd.inward] : [sd.inward, 0];
  const t = sd.horiz ? [1, 0] : [0, 1];
  const o = sd.horiz ? [sd.a, sd.fixed] : [sd.fixed, sd.a];
  return {
    n, t, horiz: sd.horiz,
    L: (sd.b - sd.a) / PXM,
    D: depthPx / PXM,
    P: (u, v) => [o[0] + (t[0] * u + n[0] * v) * PXM, o[1] + (t[1] * u + n[1] * v) * PXM],
    yaw: Math.atan2(n[0], n[1]),
  };
}

/**
 * A room's walls as the school's own drawings have them. floorPlans.json only
 * knows the doorways, so its room boxes are guesses; scripts/traceRooms.cjs
 * traces the real rectangles off the scanned plans. A traced outline is used
 * only if every doorway of the room sits on it and it takes no bite out of a
 * corridor — otherwise the room keeps its inferred box. Walls only: the
 * router's corridors, doorways and landings are never touched.
 */
const floorOf = (plan) => Number(Object.keys(PLANS).find((k) => PLANS[k] === plan)) || 1;
export function roomRect(plan, r) {
  const t = OUTLINES[floorOf(plan)]?.[`${r.name}@${r.rect.x1}`];
  if (!t) return r.rect;
  const q = { x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2 };
  const onEdge = (d) => sidesOf(q).some((s) => {
    const across = s.horiz ? d[1] : d[0], along = s.horiz ? d[0] : d[1];
    return Math.abs(across - s.fixed) <= 10 && along >= s.a - 4 && along <= s.b + 4;
  });
  if (!r.doors.every(onEdge)) return r.rect;
  // …and each doorway must face the corridor the router reaches it from
  const faces = r.doors.every((d) => {
    const foot = footOf(plan, d);
    if (!foot || Math.hypot(foot[0] - d[0], foot[1] - d[1]) < 3) return true;
    const i = crossedSide(sidesOf(q), d, foot);
    if (i < 0) return false;
    // the router's last step onto the doorway must come square through that
    // wall, not slide along it
    const sd = sidesOf(q)[i];
    return !(WALKS[floorOf(plan)] || []).some(([x1, y1, x2, y2]) => {
      const touches = (Math.abs(x1 - d[0]) < 2 && Math.abs(y1 - d[1]) < 2) || (Math.abs(x2 - d[0]) < 2 && Math.abs(y2 - d[1]) < 2);
      return touches && (sd.horiz ? y1 === y2 && x1 !== x2 : x1 === x2 && y1 !== y2);
    });
  });
  if (!faces) return r.rect;
  const bites = plan.HALLS.some((h) => Math.min(q.x2, h.x2) - Math.max(q.x1, h.x1) > 8
    && Math.min(q.y2, h.y2) - Math.max(q.y1, h.y1) > 8);
  return bites ? r.rect : q;
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
 * Where a walk that begins or ends at a doorway really begins or ends: a
 * step inside the room, not on the threshold. Returns the extra waypoints
 * (room side first), or null when the point isn't a room's doorway.
 */
const STAIR_IN = 1.0;          // metres a walk goes into a stairwell past its door

function roomEntry(plan, p) {
  if (!plan) return null;
  const near = (a) => Math.abs(a[0] - p[0]) < 2 && Math.abs(a[1] - p[1]) < 2;
  // A stairwell: step onto its landing, clear of the doors.
  const st = plan.STAIRS.find((o) => near(o.landing));
  if (st) {
    const q = st.rect, sides = sidesOf(q), s = sides[doorSide(sides, st.landing, st.foot)];
    const n = s.horiz ? [0, s.inward] : [s.inward, 0];
    const deep = Math.abs((s.horiz ? p[1] : p[0]) - s.fixed);
    const k = STAIR_IN * PXM - deep;
    return k > 2 ? [[p[0] + n[0] * k, p[1] + n[1] * k]] : null;
  }
  const d = plan.DOORS.find((o) => near(o.at));
  if (!d) return null;
  const r = plan.ROOMS.find((o) => o.name === d.room && o.doors.some(near))
    || plan.ROOMS.find((o) => o.name === d.room);
  if (!r) return null;
  const q = roomRect(plan, r);
  const sides = sidesOf(q);
  const s = sides[doorSide(sides, d.at, d.foot)];
  const depth = s.horiz ? q.y2 - q.y1 : q.x2 - q.x1;
  if (depth < 1.2 * PXM) return null;
  const on = s.horiz ? d.at[0] : d.at[1];
  if (on < s.a + 0.5 * PXM || on > s.b - 0.5 * PXM || Math.abs((s.horiz ? d.at[1] : d.at[0]) - s.fixed) > 12) return null;
  const k = Math.min(1.2 * PXM, depth * 0.45);
  const along = s.horiz ? d.at[0] : d.at[1];
  const onWall = s.horiz ? [along, s.fixed] : [s.fixed, along];
  const n = s.horiz ? [0, s.inward] : [s.inward, 0];
  const inside = [onWall[0] + n[0] * k, onWall[1] + n[1] * k];
  return Math.hypot(onWall[0] - p[0], onWall[1] - p[1]) > 1 ? [inside, onWall] : [inside];
}

/**
 * A builder bound to one three.js module and one set of materials.
 * Call dispose() when the scene goes away — every geometry, material and
 * texture it created is tracked so nothing leaks between mounts.
 */
export function createFloorKit(THREE) {
  const T = makeTextures(THREE);
  // The sign atlas is the single biggest texture; paint and upload it only
  // once something is actually hung on a wall.
  let atlasObj = null;
  const atlas = {
    get tex() { return (atlasObj ||= makeAtlas(THREE, PLANS)).tex; },
    uv: (k) => (atlasObj ||= makeAtlas(THREE, PLANS)).uv(k),
  };
  const prefabs = makePrefabs(THREE, { wallM: WALL_M });

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const mats = {
    hall:     std({ map: T.hallFloor, roughness: 0.34, metalness: 0 }),
    stair:    std({ map: T.terrazzo, roughness: 0.5 }),
    slab:     std({ color: 0x2c3238, roughness: 0.95 }),
    wallHall: std({ map: T.wallHall, vertexColors: true, roughness: 0.88 }),
    wallRoom: std({ map: T.wallRoom, vertexColors: true, roughness: 0.9 }),
    wallExt:  std({ map: T.wallExt, vertexColors: true, roughness: 0.95 }),
    ceiling:  std({ map: T.ceiling, roughness: 0.96 }),
    furn:     std({ vertexColors: true, roughness: 0.62 }),
    metal:    std({ vertexColors: true, roughness: 0.38, metalness: 0.55 }),
    locker:   std({ map: T.locker, vertexColors: true, roughness: 0.42, metalness: 0.35 }),
    stairs:   std({ vertexColors: true, roughness: 0.78 }),
    emit:     std({ color: 0xfffdf6, emissive: 0xfff4de, emissiveIntensity: 1.2, roughness: 1 }),
    vent:     std({ color: 0xd8d8d4, roughness: 0.5, metalness: 0.3 }),
    glass:    std({
      color: 0xd6e8f2, transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0.1,
      emissive: 0x8fb4cc, emissiveIntensity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    }),
    blob: new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false }),
    ao:   new THREE.MeshBasicMaterial({ map: T.ao, transparent: true, depthWrite: false }),
    pool: new THREE.MeshBasicMaterial({
      map: T.pool, color: 0xfff1d6, transparent: true, opacity: 0.09,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    path: new THREE.MeshBasicMaterial({ map: T.chevron }),
  };
  mats.wall = mats.wallRoom;   // older callers
  const junk = [...Object.values(mats).filter((m, i, a) => a.indexOf(m) === i), ...T.all];
  const atlasMat = () => {
    if (!mats.atlas) {
      mats.atlas = std({ map: atlas.tex, roughness: 0.6, alphaTest: 0.5 });
      junk.push(mats.atlas, atlas.tex);
    }
    return mats.atlas;
  };
  Object.values(prefabs).forEach((p) => p.parts.forEach((pt) => junk.push(pt.geo)));

  const floorTex = (kind, name) => {
    if (kind === 'gym') return [T.maple, 0.3];
    if (kind === 'library' || kind === 'conference') return [T.carpet, 0.95];
    if (kind === 'lab' || kind === 'reception') return [T.terrazzo, 0.45];
    if (kind === 'maker') return [T.concrete, 0.55];
    if (kind === 'courtyard') return [T.pavers, 0.9];
    return [T.vct[hashStr(name) % T.vct.length], 0.36];
  };

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

  // A name on a plate, floating above the walls. Dark, spaced and bold on a
  // near-white plate — or white on a coloured pill for the ends of a walk.
  // Rendered at twice the size it is shown, so the text stays crisp.
  function label(text, q, { y = TOP + 1.0, minSize = 2.0, maxSize = 3.3, accent = null } = {}) {
    let lines = isLib(text) ? ['XCHANGE', 'LIBRARY']
      : (text.length > 8 && text.includes(' ') ? text.split(/\s+/) : [text]);
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')];

    const W = 1024, H = 512;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const bw = 950, pad = 80;
    const font = (px) => `800 ${px}px "Avenir Next", Helvetica, Arial, sans-serif`;
    c.letterSpacing = '7px';
    let px = lines.length > 1 ? 120 : 168;
    c.font = font(px);
    const widest = Math.max(...lines.map((l) => c.measureText(l).width));
    if (widest > bw - pad) { px = Math.floor((px * (bw - pad)) / widest); c.font = font(px); }

    const lh = px * 1.14;
    const bh = lines.length * lh + 64;
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    const r = accent ? bh / 2 : 26;
    c.beginPath();
    c.moveTo(bx + r, by);
    c.arcTo(bx + bw, by, bx + bw, by + bh, r);
    c.arcTo(bx + bw, by + bh, bx, by + bh, r);
    c.arcTo(bx, by + bh, bx, by, r);
    c.arcTo(bx, by, bx + bw, by, r);
    c.closePath();
    if (accent) {
      c.fillStyle = `#${new THREE.Color(accent).getHexString()}`;
      c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
      c.fill();
      c.shadowColor = 'transparent';
      c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,.95)'; c.stroke();
    } else {
      c.fillStyle = 'rgba(246,248,250,.96)';
      c.fill();
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(11,16,22,.55)';
      c.stroke();
    }

    c.fillStyle = accent ? '#ffffff' : '#0b1016';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh));

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false });
    junk.push(tex, mat);
    const sp = new THREE.Sprite(mat);
    const w = Math.abs(wx(q.x2) - wx(q.x1));
    const d = Math.abs(wz(q.y2) - wz(q.y1));
    const size = Math.max(minSize, Math.min(maxSize, Math.max(w, d) * 0.42));
    sp.scale.set(size, size / 2, 1);
    sp.position.set((wx(q.x1) + wx(q.x2)) / 2, y, (wz(q.y1) + wz(q.y2)) / 2);
    sp.renderOrder = 20;
    return sp;
  }

  /** One floor: slab, finished floors, walls with doors and windows, furniture, stairs, ceilings. */
  /** `lite` (for machines rendering WebGL in software) keeps the building —
   *  walls, doors, windows, floors, stairs — and leaves out the furnishing. */
  function buildFloor(plan, { withLabels = true, lite = false } = {}) {
    const floorNo = Number(Object.keys(PLANS).find((k) => PLANS[k] === plan)) || 1;
    const topFloor = floorNo === Math.max(...Object.keys(PLANS).map(Number));

    const group = new THREE.Group();
    const walls = new THREE.Group();
    const labels = new THREE.Group();
    const halls = new THREE.Group();
    const tall = new THREE.Group();       // everything above knee height: hidden in "low walls" view
    group.add(walls, labels, halls, tall);
    const pickables = [];

    const G = {};
    ['hallW', 'roomW', 'extW', 'links', 'ceil', 'emit', 'vent', 'atlas', 'glass', 'blob', 'ao', 'pool', 'stairs', 'slab']
      .forEach((k) => { G[k] = new Geo(THREE); });
    const placed = [];

    const rooms = plan.ROOMS.map((r) => { const q = roomRect(plan, r); return { ...r, q, kind: kindOf(r.name, q) }; });
    const stairs = plan.STAIRS.map((s) => ({ ...s, q: s.rect, kind: 'stair' }));

    // the short link from a doorway or landing onto its corridor, same width
    const linkRects = [];
    const link = (p, f) => {
      if (Math.abs(f[0] - p[0]) + Math.abs(f[1] - p[1]) < 6) return;
      let [x1, x2] = [Math.min(p[0], f[0]), Math.max(p[0], f[0])];
      let [y1, y2] = [Math.min(p[1], f[1]), Math.max(p[1], f[1])];
      if (x2 - x1 < y2 - y1) { x1 -= HALL_HALF; x2 += HALL_HALF; } else { y1 -= HALL_HALF; y2 += HALL_HALF; }
      linkRects.push({ x1, y1, x2, y2 });
    };
    plan.DOORS.forEach((d) => link(d.at, d.foot));
    plan.STAIRS.forEach((s) => link(s.landing, s.foot));

    const inR = (q, x, y) => x >= q.x1 && x <= q.x2 && y >= q.y1 && y <= q.y2;
    function regionAt(x, y) {
      if (plan.HALLS.some((h) => inR(h, x, y)) || linkRects.some((h) => inR(h, x, y))) return 'hall';
      const r = rooms.find((o) => inR(o.q, x, y));
      if (r) return r.kind === 'courtyard' ? 'out' : 'room';
      if (stairs.some((s) => inR(s.q, x, y))) return 'room';
      return 'out';
    }
    // What the face of a wall on line `fixed` sees, at `along`, on side `dir`:
    // 'hall', 'room', 'out' (daylight: outside the building or the
    // courtyard) or 'void' (an unmapped pocket inside the building, which
    // gets a plain wall — a window onto it would look into nothing).
    const court = rooms.filter((r) => r.kind === 'courtyard').map((r) => r.q);
    const bb = plan.bbox;
    const seen = new Map();
    function sees(horiz, fixed, along, dir) {
      const key = `${horiz ? 'h' : 'v'}${Math.round(fixed)}:${Math.round(along / 6)}:${dir}`;
      if (seen.has(key)) return seen.get(key);
      const p = (off) => (horiz ? [along, fixed + dir * off] : [fixed + dir * off, along]);
      let res = regionAt(...p(WT + 5));
      if (res === 'out') {
        res = 'void';
        for (let off = WT + 5; ; off += 10) {
          const [x, y] = p(off);
          if (court.some((q) => inR(q, x, y))) { res = 'out'; break; }
          if (x < bb.x1 - 20 || x > bb.x2 + 20 || y < bb.y1 - 20 || y > bb.y2 + 20) { res = 'out'; break; }
          if (regionAt(x, y) !== 'out') {
            // a narrow gap before more building is just a cavity in the wall
            res = off > 60 ? 'void' : regionAt(x, y);
            break;
          }
        }
      }
      seen.set(key, res);
      return res;
    }
    const ptOn = (L, along, across) => (L.horiz ? [along, across] : [across, along]);

    // Where the router walks up to every doorway and stair landing: nothing
    // may stand on these, in a room or a corridor.
    const walkEdges = (WALKS[floorNo] || []).map(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]]);
    const approaches = [
      ...plan.DOORS.map((d) => [d.foot, d.at]),
      ...plan.STAIRS.map((s) => [s.foot, s.landing]),
      ...walkEdges,
    ];
    const segDist = (a, b, x, y) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1);
      return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
    };
    const clearOfWalks = (x, y, radM) => approaches.every(([a, b]) => segDist(a, b, x, y) > (radM + 0.6) * PXM);

    // ── placement helpers ─────────────────────────────────────────────────
    function blobAt(bx, by, yaw, wM, dM) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const hw = (wM * UM * 0.6), hd = (dM * UM * 0.6);
      const x = wx(bx), z = wz(by), y = FY + 0.005;
      const pt = (a, b) => [x + a * c + b * s, y, z - a * s + b * c];
      G.blob.quad(pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd), [0, 1, 0]);
    }
    function put(pf, bx, by, yM, yaw, o = {}) {
      placed.push({
        pf, x: wx(bx), y: FY + yM * UM, z: wz(by), yaw,
        pitch: o.pitch || 0, sx: o.sx || 1, sy: o.sy || 1, sz: o.sz || 1, color: o.color,
      });
      const B = prefabs[pf].blob;
      if (B && !o.noBlob && !yM) blobAt(bx, by, yaw, B[0] * (o.sx || 1), B[1]);
    }
    // a flat sign, poster or board from the atlas, standing off a wall
    function quadAt(key, bx, by, yM, yaw, wM, hM, offM = 0.012) {
      const n = [Math.sin(yaw), Math.cos(yaw)];
      const r = [Math.cos(yaw), -Math.sin(yaw)];
      const cx = wx(bx) + n[0] * offM * UM, cz = wz(by) + n[1] * offM * UM;
      const cy = FY + yM * UM;
      const hw = (wM * UM) / 2, hh = (hM * UM) / 2;
      const uv = atlas.uv(key);
      G.atlas.quad(
        [cx - r[0] * hw, cy - hh, cz - r[1] * hw],
        [cx + r[0] * hw, cy - hh, cz + r[1] * hw],
        [cx + r[0] * hw, cy + hh, cz + r[1] * hw],
        [cx - r[0] * hw, cy + hh, cz - r[1] * hw],
        [n[0], 0, n[1]],
        [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]],
      );
    }
    // a horizontal quad over a blueprint rectangle, facing up or down
    function flat(g, q, y, down, tileM) {
      const pts = [[q.x1, q.y1], [q.x2, q.y1], [q.x2, q.y2], [q.x1, q.y2]].map(([a, b]) => [wx(a), y, wz(b)]);
      const uv = pts.map((p) => (tileM ? [p[0] / UM / tileM, p[2] / UM / tileM] : [0, 0]));
      g.quad(pts[0], pts[1], pts[2], pts[3], [0, down ? -1 : 1, 0], uv);
    }
    const around = (x, y, hwM, hdM) => ({ x1: x - hwM * PXM, x2: x + hwM * PXM, y1: y - hdM * PXM, y2: y + hdM * PXM });

    // ── walls ─────────────────────────────────────────────────────────────
    // Each room contributes its four sides; sides that share a line are
    // merged, so neighbours share one wall instead of two overlapping ones.
    const lines = new Map();
    const snaps = { h: [], v: [] };
    const lineOf = (h, f) => {
      const arr = snaps[h ? 'h' : 'v'];
      let fx = arr.find((v) => Math.abs(v - f) <= 3);
      if (fx === undefined) { fx = f; arr.push(f); }
      const k = `${h ? 'h' : 'v'}${fx}`;
      if (!lines.has(k)) lines.set(k, { horiz: h, fixed: fx, spans: [], gaps: [] });
      return lines.get(k);
    };
    function shell(owner, q, doorPts, wide) {
      const sides = sidesOf(q);
      const owned = sides.map(() => []);
      doorPts.forEach((d) => owned[doorSide(sides, d, footOf(plan, d))].push(d));
      sides.forEach((s, i) => {
        const L = lineOf(s.horiz, s.fixed);
        L.spans.push([s.a, s.b]);
        owned[i].forEach((d) => {
          const along = s.horiz ? d[0] : d[1];
          const half = Math.min(wide ? DOOR_WIDE : DOOR_HALF, (s.b - s.a) / 2 - 3);
          if (half < 4) return;
          const c = along;          // exactly where the router walks through
          L.gaps.push({ c, half, inward: s.inward, owner, wide });
        });
      });
      return owned;
    }
    rooms.forEach((r) => { r.owned = shell(r, r.q, r.doors, r.kind === 'gym' || r.kind === 'library'); });
    stairs.forEach((s) => { s.owned = shell(s, s.q, [s.landing], true); });
    // A corridor edge with no room behind it is the building's outside wall
    // (or a courtyard's): close it, so a walk never looks out into nothing.
    const entries = [...plan.DOORS.flatMap((d) => [d.at, d.foot]), ...plan.STAIRS.flatMap((s) => [s.landing, s.foot])];
    const nearEntry = (horiz, fixed, along) => entries.some((p) => Math.abs((horiz ? p[0] : p[1]) - along) < DOOR_WIDE + 6
      && Math.abs((horiz ? p[1] : p[0]) - fixed) < 40);
    [...plan.HALLS, ...linkRects].forEach((h) => {
      sidesOf(h).forEach((s) => {
        let run = null;
        const flush = () => { if (run && run[1] - run[0] > 4) lineOf(s.horiz, s.fixed).spans.push(run); run = null; };
        for (let a = s.a; a <= s.b; a += 4) {
          const out = regionAt(...(s.horiz ? [a, s.fixed - s.inward * 7] : [s.fixed - s.inward * 7, a])) === 'out'
            && !nearEntry(s.horiz, s.fixed, a);
          if (out) { if (!run) run = [a, a]; else run[1] = a; } else flush();
        }
        flush();
      });
    });

    const openings = [];
    const hallFaces = [];

    function wallBox(L, a, b, y0, y1, top) {
      const [x1, z1, x2, z2] = L.horiz
        ? [wx(a), wz(L.fixed - WT), wx(b), wz(L.fixed + WT)]
        : [wx(L.fixed - WT), wz(a), wx(L.fixed + WT), wz(b)];
      const mid = (a + b) / 2;
      const bucket = (s) => (s === 'hall' ? G.hallW : s === 'out' ? G.extW : G.roomW);
      const pos = bucket(sees(L.horiz, L.fixed, mid, 1));
      const neg = bucket(sees(L.horiz, L.fixed, mid, -1));
      G.roomW.box(x1, y0, z1, x2, y1, z2, '#ffffff', {
        top,
        route: (dir) => {
          if (dir === 'py') return G.roomW;
          if (dir === (L.horiz ? 'pz' : 'px')) return pos;
          if (dir === (L.horiz ? 'nz' : 'nx')) return neg;
          return G.roomW;
        },
        uv: (p, n, dir) => {
          if (dir === 'py') return [0.1, 0.5];
          const along = Math.abs(n[0]) > 0.5 ? p[2] : p[0];
          return [along / UM / 1.6, (p[1] - FY) / WALL_H];
        },
      });
    }
    // soft contact shadow where a wall meets the floor
    function aoStrip(L, a, b, dir) {
      const v = sees(L.horiz, L.fixed, (a + b) / 2, dir);
      if (v === 'out' || v === 'void') return;
      const f = L.fixed + dir * WT, w = 0.4 * PXM;
      const P = (al, ac) => { const [x, y] = ptOn(L, al, ac); return [wx(x), FY + 0.004, wz(y)]; };
      G.ao.quad(P(a, f), P(b, f), P(b, f + dir * w), P(a, f + dir * w), [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    function recordHall(L, a, b) {
      [1, -1].forEach((dir) => {
        let run = null;
        for (let x = a + 4; x <= b - 4; x += 8) {
          if (sees(L.horiz, L.fixed, x, dir) === 'hall') {
            if (!run) run = [x - 4, x + 4]; else run[1] = x + 4;
          } else if (run) { hallFaces.push({ L, dir, a: run[0], b: run[1] }); run = null; }
        }
        if (run) hallFaces.push({ L, dir, a: run[0], b: Math.min(run[1], b) });
      });
    }
    function windowAt(L, s, e) {
      wallBox(L, s, e, 0, FY + 0.9 * UM, '#d9d4ca');
      wallBox(L, s, e, FY + 2.3 * UM, TOP, CAP);
      const c = (s + e) / 2;
      const [bx, by] = ptOn(L, c, L.fixed);
      put('winFrame', bx, by, 0.9, L.horiz ? 0 : Math.PI / 2);
      const P = (al, yM) => { const [x, y] = ptOn(L, al, L.fixed); return [wx(x), FY + yM * UM, wz(y)]; };
      G.glass.quad(P(s, 0.9), P(e, 0.9), P(e, 2.3), P(s, 2.3), L.horiz ? [0, 0, 1] : [1, 0, 0]);
      openings.push({ horiz: L.horiz, fixed: L.fixed, a: s, b: e, kind: 'window' });
      aoStrip(L, s, e, 1); aoStrip(L, s, e, -1);
    }
    function solidPiece(L, a, b) {
      if (b - a < 0.5) return;
      const mod = 1.7 * PXM, win = 1.2 * PXM;
      const segs = [];
      let cur = a;
      const n = Math.floor((b - a - 0.6 * PXM) / mod);
      if (n > 0) {
        const start = a + (b - a - n * mod) / 2;
        for (let k = 0; k < n; k += 1) {
          const c = start + (k + 0.5) * mod;
          const p = sees(L.horiz, L.fixed, c, 1), m = sees(L.horiz, L.fixed, c, -1);
          const lit = (x) => x === 'hall' || x === 'room';
          if ((p === 'out' && lit(m)) || (m === 'out' && lit(p))) {
            segs.push(['solid', cur, c - win / 2], ['win', c - win / 2, c + win / 2]);
            cur = c + win / 2;
          }
        }
      }
      segs.push(['solid', cur, b]);
      segs.forEach(([kind, s, e]) => {
        if (e - s < 0.3) return;
        if (kind === 'win') { windowAt(L, s, e); return; }
        wallBox(L, s, e, 0, TOP, CAP);
        recordHall(L, s, e);
        aoStrip(L, s, e, 1); aoStrip(L, s, e, -1);
      });
    }
    function doorway(L, g) {
      const s = g.c - g.half, e = g.c + g.half;
      wallBox(L, s, e, FY + 2.19 * UM, TOP, CAP);
      openings.push({ horiz: L.horiz, fixed: L.fixed, a: s, b: e, kind: 'door' });
      const yaw = L.horiz ? 0 : Math.PI / 2;
      [[s, 0.03], [e, -0.03]].forEach(([p, k]) => { const [bx, by] = ptOn(L, p + k * PXM, L.fixed); put('jamb', bx, by, 0, yaw); });
      const [hx, hy] = ptOn(L, g.c, L.fixed);
      put('head', hx, hy, 0, yaw, { sx: (2 * g.half) / PXM });

      // the leaf (or pair) standing open into the room it belongs to
      const n = L.horiz ? [0, g.inward] : [g.inward, 0];
      const leafYaw = Math.atan2(-n[1], n[0]);
      const face = L.fixed + g.inward * WT;
      const R = rng(hashStr(`${L.fixed}:${g.c}`));
      const hinges = g.wide ? [s, e] : [R() < 0.5 ? s : e];
      const leafM = ((g.wide ? g.half : 2 * g.half) / PXM) - 0.08;
      hinges.forEach((h) => {
        const [bx, by] = ptOn(L, h + (h === s ? 0.05 : -0.05) * PXM, face);
        put('leaf', bx, by, 0, leafYaw, { sx: leafM / 0.9 });
      });

      // the corridor side: room plaque, and for a stairwell its exit sign
      const hallSide = [1, -1].find((d) => sees(L.horiz, L.fixed, g.c, d) === 'hall');
      if (!hallSide) return;
      const hf = L.fixed + hallSide * WT;
      const yawF = Math.atan2(L.horiz ? 0 : hallSide, L.horiz ? hallSide : 0);
      const isStair = g.owner.kind === 'stair';
      const name = isStair ? g.owner.name.toUpperCase() : g.owner.name;
      const pl = ptOn(L, e + 0.28 * PXM, hf);
      quadAt(`plaque:${name}`, pl[0], pl[1], 1.5, yawF, 0.26, 0.1);
      if (isStair) {
        const [ex, ey] = ptOn(L, g.c, hf);
        put('exitBox', ex, ey, 2.33, yawF);
        quadAt('exit', ex, ey, 2.43, yawF, 0.34, 0.15, 0.072);
        const ev = ptOn(L, s - 0.55 * PXM, hf);
        quadAt(`evac:${floorNo}`, ev[0], ev[1], 1.5, yawF, 0.44, 0.31);
        const pu = ptOn(L, e + 0.3 * PXM, hf);
        put('pull', pu[0], pu[1], 0, yawF);
      }
    }

    lines.forEach((L) => {
      const sp = L.spans.map(([a, b]) => [a - WT, b + WT]).sort((p, n) => p[0] - n[0]);
      const merged = [];
      sp.forEach((s) => {
        const last = merged[merged.length - 1];
        if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1]);
        else merged.push([...s]);
      });
      const gaps = [];
      L.gaps.sort((p, n) => p.c - n.c).forEach((g) => {
        if (!gaps.some((o) => Math.abs(o.c - g.c) < o.half + g.half)) gaps.push(g);
      });
      // Wherever a real route crosses this line or runs along it, open it:
      // the model must never block a walk the router produces.
      const carves = [];
      walkEdges.forEach(([[x1, y1], [x2, y2]]) => {
        const [ax1, ac1, ax2, ac2] = L.horiz ? [x1, y1, x2, y2] : [y1, x1, y2, x2];
        const lo = Math.min(ax1, ax2), hi = Math.max(ax1, ax2);
        if (ac1 === ac2 && Math.abs(ac1 - L.fixed) < WT + 3) carves.push({ s: lo - 4, e: hi + 4, cross: false });
        else if (ax1 === ax2 && L.fixed > Math.min(ac1, ac2) - WT && L.fixed < Math.max(ac1, ac2) + WT) {
          carves.push({ s: ax1 - DOOR_HALF, e: ax1 + DOOR_HALF, cross: true });
        }
      });
      const cuts = [
        ...gaps.map((g) => ({ s: g.c - g.half, e: g.c + g.half, door: g })),
        ...carves,                // overlapping a door just widens the opening
      ].sort((p, n) => p.s - n.s);
      merged.forEach(([a, b]) => {
        let cur = a;
        cuts.filter((c) => c.e > a && c.s < b).forEach((c) => {
          if (c.s > cur) solidPiece(L, cur, c.s);
          if (c.door) doorway(L, c.door);
          else if (c.cross && c.s >= cur - 1) wallBox(L, Math.max(c.s, cur), Math.min(c.e, b), FY + 2.19 * UM, TOP, CAP);
          cur = Math.max(cur, c.e);
        });
        if (cur < b) solidPiece(L, cur, b);
      });
    });

    // ── rooms ─────────────────────────────────────────────────────────────
    function roomFrame(q, s) {
      const depth = (s.horiz ? q.y2 - q.y1 : q.x2 - q.x1) - 2 * WT;
      const F = frameOf({ horiz: s.horiz, fixed: s.fixed + s.inward * WT, a: s.a + WT, b: s.b - WT, inward: s.inward }, depth);
      const a0 = s.a + WT;
      const on = (o) => o.horiz === s.horiz && Math.abs(o.fixed - s.fixed) <= 4;
      F.a0 = a0;
      F.blocked = (u1, u2, kinds = ['door', 'window']) => openings.some((o) => on(o) && kinds.includes(o.kind)
        && o.b > a0 + u1 * PXM - 2 && o.a < a0 + u2 * PXM + 2);
      F.windows = openings.filter((o) => on(o) && o.kind === 'window' && o.b > s.a && o.a < s.b).length;
      return F;
    }

    function furnish(r) {
      const q = r.q;
      const R = rng(hashStr(`${floorNo}:${r.name}:${q.x1}`));
      const frames = sidesOf(q).map((s, i) => Object.assign(roomFrame(q, s), { i, doors: r.owned[i] }));
      if (Math.min(frames[0].D, frames[2].D) < 1.0) return;
      const doors = r.doors;
      const clear = (bx, by, rad) => doors.every((d) => Math.hypot(d[0] - bx, d[1] - by) > (rad + 1.2) * PXM)
        && approaches.every(([a, b]) => segDist(a, b, bx, by) > (rad + 0.7) * PXM);
      const at = (F, pf, u, v, yawOff = 0, o = {}) => {
        if (u < 0.05 || v < 0 || u > F.L - 0.05 || v > F.D) return false;
        const [bx, by] = F.P(u, v);
        if (o.check !== false && !clear(bx, by, o.r ?? 0.45)) return false;
        put(pf, bx, by, o.y || 0, F.yaw + yawOff, o);
        return true;
      };
      const hang = (F, key, u, yM, wM, hM, off = 0.012) => {
        if (u - wM / 2 < 0.1 || u + wM / 2 > F.L - 0.1 || F.blocked(u - wM / 2, u + wM / 2)) return false;
        const [bx, by] = F.P(u, 0);
        quadAt(key, bx, by, yM, F.yaw, wM, hM, off);
        return true;
      };
      // a place to sit: a desk (or a spot at a table) and its chair behind it,
      // facing `look` — given in the frame's own (u, v) directions
      const seat = (F, u, v, lu, lv, col, o = {}) => {
        if (u < 0.35 || u > F.L - 0.35 || v < 0.3 || v > F.D - 0.3) return;
        const lx = F.t[0] * lu + F.n[0] * lv, ly = F.t[1] * lu + F.n[1] * lv;
        const yaw = Math.atan2(-lx, -ly) + (R() - 0.5) * 0.08;
        const [bx, by] = F.P(u + (R() - 0.5) * 0.05, v + (R() - 0.5) * 0.05);
        if (!clear(bx, by, 0.55)) return;
        if (o.desk !== false) put(o.desk || 'desk', bx, by, 0, yaw);
        if (R() < 0.05) return;                                   // someone took the chair
        const g = (o.gap ?? 0.45) + (R() < 0.12 ? 0.22 : 0);      // …or left it pushed out
        put(o.chair || 'chair', bx + Math.sin(yaw) * g * PXM, by + Math.cos(yaw) * g * PXM, 0,
          yaw + (R() - 0.5) * 0.5, { color: col });
      };
      const doorU = (F, d) => ((F.horiz ? d[0] : d[1]) - F.a0) / PXM;

      // the teaching wall: no door, ideally no windows, a sensible length
      const cands = frames.filter((F) => !F.doors.length && F.L > 2.4)
        .map((F) => ({ F, s: (F.windows ? -3 : 0) - Math.abs(F.L - 7) * 0.15 + R() * 0.8 }))
        .sort((a, b) => b.s - a.s);
      const doorSide = frames.findIndex((F) => F.doors.length);
      const front = cands.length ? cands[0].F : frames[doorSide >= 0 ? doorSide ^ 1 : 0];
      const back = frames[front.i ^ 1];
      const longest = [...frames].sort((a, b) => b.L - a.L);
      const longFree = longest.find((F) => !F.doors.length) || longest[0];

      function dressWalls() {
        frames.forEach((F) => {
          for (let u = 0.9; u < F.L - 0.4; u += 2.6 + R() * 1.2) {
            if (!F.blocked(u - 0.1, u + 0.1, ['door'])) hang(F, 'outlet', u, 0.4, 0.07, 0.115, 0.006);
          }
          F.doors.forEach((d) => {
            const du = doorU(F, d);
            hang(F, 'switch', du + 0.85, 1.2, 0.07, 0.115, 0.006) || hang(F, 'switch', du - 0.85, 1.2, 0.07, 0.115, 0.006);
          });
        });
        const Fd = frames[doorSide];
        if (Fd && r.kind !== 'courtyard') {
          const du = doorU(Fd, Fd.doors[0]);
          const u = du + 1.5 < Fd.L - 0.3 ? du + 1.5 : du - 1.5;
          if (u > 0.3 && !Fd.blocked(u - 0.5, u + 0.5, ['door'])) {
            at(Fd, 'trash', u, 0.25, 0, { check: false });
            at(Fd, 'recycle', u + (u > du ? 0.48 : -0.48), 0.25, 0, { check: false, color: '#2563eb' });
          }
        }
      }
      function decorate() {
        const bw2 = Math.min(2.4, back.L - 1.4);
        if (!(bw2 > 1 && hang(back, `cork${Math.floor(R() * 4)}`, back.L / 2, 1.45, bw2, 1.2))) {
          for (let u = 1; u < back.L - 0.8; u += 1.4) if (R() < 0.5) hang(back, `poster${Math.floor(R() * 14)}`, u, 1.6, 0.55, 0.77);
        }
        frames.filter((F) => F !== front && F !== back).forEach((F) => {
          if (F.windows && R() < 0.65) {
            for (let u = 0.5; u + 1 < F.L - 0.3; u += 1.0) {
              if (!F.blocked(u - 0.05, u + 1.05, ['door']) && at(F, 'counter', u + 0.5, 0.3, 0, { r: 0.4 }) && R() < 0.14) {
                at(F, 'plant', u + 0.5, 0.3, 0, { y: 0.9, check: false });
              }
            }
          } else if (R() < 0.55) {
            const n = 1 + Math.floor(R() * 3), fromEnd = R() < 0.5;
            for (let k = 0; k < n; k += 1) {
              const u = fromEnd ? F.L - 0.5 - k * 0.92 : 0.5 + k * 0.92;
              if (!F.blocked(u - 0.46, u + 0.46)) at(F, 'tallCab', u, 0.23, 0, { r: 0.4 });
            }
          }
          for (let u = 1.0; u < F.L - 0.8; u += 1.3) if (R() < 0.4) hang(F, `poster${Math.floor(R() * 14)}`, u, 1.65, 0.5, 0.7);
        });
      }
      function teachingWall(F) {
        const L = F.L, D = F.D;
        const bw = clamp(L * 0.45, 1.8, 4.8);
        const tv = L - bw > 3.4 && R() < 0.6;
        const bc = tv ? L / 2 - 0.8 : L / 2;
        if (hang(F, `wb${Math.floor(R() * 4)}`, bc, 1.5, bw - 0.06, 1.14, 0.022)) {
          const [bx, by] = F.P(bc, 0);
          put('wbFrame', bx, by, 1.5, F.yaw, { sx: bw, sy: 1.2 });
          put('wbTray', bx, by, 0.9, F.yaw, { sx: bw });
          hang(F, 'clock', bc, 2.55, 0.32, 0.32);
        }
        const tu = bc + bw / 2 + 1.1;
        if (tv && !F.blocked(tu - 0.7, tu + 0.7)) {
          const [bx, by] = F.P(tu, 0);
          put('tvBody', bx, by, 1.75, F.yaw);
          quadAt(`tv${Math.floor(R() * 2)}`, bx, by, 1.75, F.yaw, 1.22, 0.69, 0.062);
        } else if (R() < 0.6) at(F, 'projector', L / 2, Math.min(D * 0.45, 4.5), 0, { check: false, noBlob: true });
        const u = R() < 0.5 ? Math.min(1.5, L * 0.25) : Math.max(L - 1.5, L * 0.75);
        if (at(F, 'teacherDesk', u, 1.4, Math.PI, { r: 0.8 })) at(F, 'officeChair', u + (R() - 0.5) * 0.3, 0.75, Math.PI + (R() - 0.5) * 0.8);
      }

      const col = pick(R, CHAIR_COLS);
      const F = front, L = F.L, D = F.D;
      const u0 = 0.9, u1 = L - 0.9, v0 = 2.6, v1 = D - 0.8;

      switch (r.kind) {
        case 'classroom': {
          teachingWall(F);
          if (v1 - v0 > 0.8 && u1 - u0 > 0.8) {
            let layout = pick(R, ['rows', 'rows', 'pairs', 'pods', 'ushape', 'seminar']);
            if (v1 - v0 < 2.4 && layout !== 'seminar') layout = 'rows';
            if (layout === 'rows') {
              const nx = Math.max(1, Math.floor((u1 - u0) / 0.9)), ny = Math.max(1, Math.floor((v1 - v0) / 1.2));
              for (let i = 0; i < nx; i += 1) for (let j = 0; j < ny; j += 1) seat(F, u0 + ((i + 0.5) * (u1 - u0)) / nx, v0 + j * 1.2 + 0.2, 0, -1, col);
            } else if (layout === 'pairs') {
              const np = Math.max(1, Math.floor((u1 - u0 + 0.8) / 2.1)), ny = Math.max(1, Math.floor((v1 - v0) / 1.2));
              for (let p = 0; p < np; p += 1) {
                const pc = u0 + ((u1 - u0) * (p + 0.5)) / np;
                for (let j = 0; j < ny; j += 1) [-0.31, 0.31].forEach((d) => seat(F, pc + d, v0 + j * 1.2 + 0.2, 0, -1, col));
              }
            } else if (layout === 'pods') {
              const nx = Math.max(1, Math.floor((u1 - u0) / 2.5)), ny = Math.max(1, Math.floor((v1 - v0) / 2.4));
              for (let i = 0; i < nx; i += 1) {
                for (let j = 0; j < ny; j += 1) {
                  const pu = u0 + ((i + 0.5) * (u1 - u0)) / nx, pv = v0 + ((j + 0.5) * (v1 - v0)) / ny;
                  [-0.31, 0.31].forEach((d) => { seat(F, pu + d, pv - 0.24, 0, 1, col); seat(F, pu + d, pv + 0.24, 0, -1, col); });
                }
              }
            } else if (layout === 'ushape') {
              for (let v = v0; v < v1 - 1.2; v += 0.9) { seat(F, u0 + 0.2, v, 1, 0, col); seat(F, u1 - 0.2, v, -1, 0, col); }
              for (let u = u0 + 1.3; u < u1 - 1.2; u += 0.9) seat(F, u, v1 - 0.1, 0, -1, col);
            } else {
              const nt = Math.max(1, Math.floor((u1 - u0) / 2.6)), nr = Math.max(1, Math.floor((v1 - v0) / 2.3));
              for (let i = 0; i < nt; i += 1) {
                for (let j = 0; j < nr; j += 1) {
                  const tu = u0 + ((i + 0.5) * (u1 - u0)) / nt, tv = v0 + ((j + 0.5) * (v1 - v0)) / nr;
                  if (!at(F, 'libTable', tu, tv, 0, { r: 0.9 })) continue;
                  [-0.45, 0.45].forEach((d) => { seat(F, tu + d, tv - 0.3, 0, 1, col, { desk: false }); seat(F, tu + d, tv + 0.3, 0, -1, col, { desk: false }); });
                }
              }
            }
          }
          decorate();
          break;
        }
        case 'lab': {
          teachingWall(F);
          for (let v = 2.8; v < D - 1.3; v += 2.1) {
            const n = Math.max(1, Math.floor((u1 - u0) / 2.3));
            for (let i = 0; i < n; i += 1) {
              const u = u0 + ((i + 0.5) * (u1 - u0)) / n;
              if (at(F, 'labBench', u, v, 0, { r: 1 })) [-0.45, 0.45].forEach((d) => at(F, 'stool', u + d, v + 0.62, 0, { color: col, r: 0.2 }));
            }
          }
          decorate();
          break;
        }
        case 'narrow': {
          for (let u = 0.3; u + 1 < longFree.L - 0.2; u += 1.0) {
            if (!longFree.blocked(u, u + 1, ['door'])) {
              at(longFree, 'counter', u + 0.5, 0.3, 0, { r: 0.3 });
              if (longFree.D > 1.9 && R() < 0.5) at(longFree, 'stool', u + 0.5, 1.0, 0, { color: col, r: 0.2 });
            }
          }
          const opp = frames[longFree.i ^ 1];
          for (let u = 1; u < opp.L - 0.8; u += 1.6) if (R() < 0.5) hang(opp, `poster${Math.floor(R() * 14)}`, u, 1.6, 0.5, 0.7);
          break;
        }
        case 'closet': {
          for (let u = 0.5; u < longFree.L - 0.45; u += 0.92) if (!longFree.blocked(u - 0.46, u + 0.46)) at(longFree, `shelf${Math.floor(R() * 3)}`, u, 0, 0, { r: 0.3 });
          break;
        }
        case 'gym': {
          const stands = longFree;
          for (let u = 1.2; u + 1 < stands.L - 0.4; u += 2.05) {
            if (!stands.blocked(u - 1.05, u + 1.05, ['door'])) at(stands, 'bleacher', u, 0, 0, { r: 1.3 });
          }
          frames.filter((X) => X.horiz !== stands.horiz).forEach((X) => at(X, 'hoop', X.L / 2, 0, 0, { check: false }));
          const opp = frames[stands.i ^ 1];
          at(opp, 'gymMat', 1.6, 1.0, 0, { color: '#1d4ed8' }) || at(opp, 'gymMat', opp.L - 1.6, 1.0, 0, { color: '#1d4ed8' });
          const x1 = q.x1 + WT, x2 = q.x2 - WT, y1 = q.y1 + WT, y2 = q.y2 - WT;
          const tex = courtTexture(THREE, (x2 - x1) / PXM, (y2 - y1) / PXM);
          const m = std({ map: tex, transparent: true, depthWrite: false, roughness: 0.3 });
          junk.push(tex, m);
          const g = new Geo(THREE);
          const y = FY + 0.003;
          g.quad([wx(x1), y, wz(y1)], [wx(x2), y, wz(y1)], [wx(x2), y, wz(y2)], [wx(x1), y, wz(y2)], [0, 1, 0],
            [[0, 1], [1, 1], [1, 0], [0, 0]]);
          const geo = g.build(); junk.push(geo);
          const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.renderOrder = 1;
          group.add(mesh);
          break;
        }
        case 'library': {
          frames.forEach((X) => {
            for (let u = 0.55; u < X.L - 0.5; u += 0.92) if (!X.blocked(u - 0.46, u + 0.46)) at(X, `shelf${Math.floor(R() * 3)}`, u, 0, 0, { r: 0.35 });
          });
          const A = longFree;
          if (A.D > 6) {
            for (let v = A.D - 2.4; v > A.D / 2; v -= 2.4) {
              for (let u = 1.6; u < A.L - 1.6; u += 0.92) {
                const k = Math.floor(R() * 3);
                if (at(A, `shelf${k}`, u, v, 0, { r: 0.35 })) at(A, `shelf${(k + 1) % 3}`, u, v, Math.PI, { check: false });
              }
            }
          }
          const tEnd = A.D > 6 ? A.D / 2 : A.D - 1.2;
          for (let v = 2.2; v < tEnd; v += 2.6) {
            for (let u = 2; u < A.L - 1.8; u += 3) {
              if (at(A, 'libTable', u, v, 0, { r: 0.9 })) [-0.45, 0.45].forEach((d) => { seat(A, u + d, v - 0.3, 0, 1, '#4b5563', { desk: false }); seat(A, u + d, v + 0.3, 0, -1, '#4b5563', { desk: false }); });
            }
          }
          const Fd = frames[doorSide];
          if (Fd && Fd.D > 4) {
            const du = doorU(Fd, Fd.doors[0]);
            const u = du + 2.6 < Fd.L - 1.4 ? du + 2.6 : du - 2.6;
            at(Fd, 'reception', u, 2.4, 0, { r: 1.2 }) && at(Fd, 'officeChair', u, 3.0, Math.PI, { check: false });
          }
          hang(back, `cork${Math.floor(R() * 4)}`, back.L / 2, 2.2, 1.6, 0.9);
          break;
        }
        case 'clinic': {
          for (let u = 0.8; u < longFree.L - 0.6; u += 1.35) if (!longFree.blocked(u - 0.5, u + 0.5, ['door'])) at(longFree, 'bed', u, 0, 0, { r: 0.9 });
          const opp = frames[longFree.i ^ 1];
          at(opp, 'computerDesk', 1.2, 0.4, 0, { r: 0.8 }) && at(opp, 'officeChair', 1.2, 0.95, 0, { check: false });
          for (let u = opp.L - 0.6, k = 0; k < 3; k += 1, u -= 1) if (!opp.blocked(u - 0.5, u + 0.5)) at(opp, k ? 'counter' : 'tallCab', u, k ? 0.3 : 0.23, 0, { r: 0.4 });
          hang(opp, `poster${Math.floor(R() * 14)}`, opp.L / 2, 1.6, 0.5, 0.7);
          break;
        }
        case 'reception': {
          const Fd = frames[doorSide] || front;
          const du = Fd.doors.length ? doorU(Fd, Fd.doors[0]) : Fd.L / 2;
          if (Fd.D > 3.4) at(Fd, 'reception', clamp(du, 1.5, Fd.L - 1.5), Math.min(2.8, Fd.D - 1.1), 0, { r: 1.2 })
            && at(Fd, 'officeChair', clamp(du, 1.5, Fd.L - 1.5), Math.min(3.35, Fd.D - 0.5), Math.PI, { check: false });
          frames.filter((X) => X.horiz !== Fd.horiz).forEach((X) => {
            for (let u = 0.8; u < X.L - 0.6; u += 0.62) seat(X, u, 0.8, 0, 1, '#2f5d8a', { desk: false });
            at(X, 'plant', 0.4, 0.35, 0, { r: 0.2 });
          });
          hang(back, 'tv0', back.L / 2, 1.75, 1.22, 0.69, 0.062) && put('tvBody', ...back.P(back.L / 2, 0), 1.75, back.yaw);
          break;
        }
        case 'conference': {
          const A = longest[0];
          if (A.D >= 3 && A.L >= 4.8) {
            at(A, 'confTable', A.L / 2, A.D / 2, 0, { check: false });
            for (let u = A.L / 2 - 1.35; u <= A.L / 2 + 1.36; u += 0.9) {
              seat(A, u, A.D / 2 - 0.35, 0, 1, '#2c3036', { desk: false, chair: 'officeChair', gap: 0.5 });
              seat(A, u, A.D / 2 + 0.35, 0, -1, '#2c3036', { desk: false, chair: 'officeChair', gap: 0.5 });
            }
          } else {
            at(A, 'libTable', A.L / 2, A.D / 2, 0, { check: false });
            [-0.45, 0.45].forEach((d) => { seat(A, A.L / 2 + d, A.D / 2 - 0.3, 0, 1, '#2c3036', { desk: false, chair: 'officeChair' }); seat(A, A.L / 2 + d, A.D / 2 + 0.3, 0, -1, '#2c3036', { desk: false, chair: 'officeChair' }); });
          }
          const ends = frames.filter((X) => X.horiz !== A.horiz && !X.doors.length);
          if (ends[0] && hang(ends[0], 'tv1', ends[0].L / 2, 1.6, 1.22, 0.69, 0.062)) put('tvBody', ...ends[0].P(ends[0].L / 2, 0), 1.6, ends[0].yaw);
          for (let u = 0.6; u < 3.2; u += 1) if (!frames[A.i ^ 1].blocked(u - 0.5, u + 0.5)) at(frames[A.i ^ 1], 'counter', u, 0.3, 0);
          break;
        }
        case 'maker': {
          const A = longest[0];
          for (let v = 1.8; v < A.D - 1.0; v += 2.5) {
            for (let u = 1.6; u < A.L - 1.4; u += 2.8) {
              if (at(A, 'workTable', u, v, 0, { r: 1 })) [-0.5, 0.5].forEach((d) => { at(A, 'stool', u + d, v - 0.72, 0, { color: col, r: 0.2 }); at(A, 'stool', u + d, v + 0.72, 0, { color: col, r: 0.2 }); });
            }
          }
          const opp = frames[A.i ^ 1];
          for (let u = 0.5; u < opp.L - 0.45; u += 0.92) if (!opp.blocked(u - 0.46, u + 0.46)) at(opp, 'tallCab', u, 0.23, 0, { r: 0.4 });
          hang(A, `cork${Math.floor(R() * 4)}`, A.L / 2, 1.5, Math.min(2.4, A.L - 1.5), 1.2);
          break;
        }
        case 'courtyard': {
          const A = longest[0];
          const n = clamp(Math.floor((A.L * A.D) / 45), 1, 4);
          for (let k = 0; k < n; k += 1) at(A, 'tree', (A.L * (k + 0.5)) / n, A.D / 2 + (k % 2 ? 0.8 : -0.8), R() * 6, { r: 1.2 });
          frames.forEach((X) => { if (X.L > 3) { at(X, 'bench', X.L / 2 - 1, 0.1, 0, { r: 0.6 }); at(X, 'planter', X.L / 2 + 1.3, 0.5, 0, { r: 0.6 }); } });
          break;
        }
        default: break;
      }
      if (r.kind !== 'courtyard' && r.kind !== 'closet') dressWalls();
    }
    if (!lite) rooms.forEach(furnish);

    // ── corridors ─────────────────────────────────────────────────────────
    const stairFeet = plan.STAIRS.map((s) => ({ name: s.name, p: s.foot }));
    (lite ? [] : hallFaces).forEach((hf) => {
      const face = hf.L.fixed + hf.dir * WT;
      const F = frameOf({ horiz: hf.L.horiz, fixed: face, a: hf.a, b: hf.b, inward: hf.dir }, 40);
      const R = rng(hashStr(`${floorNo}:${hf.L.horiz}:${hf.L.fixed}:${Math.round(hf.a)}`));
      const bank = pick(R, LOCKER_COLS);
      const end = F.L - 0.6;
      let u = 0.6;
      while (u < end) {
        if (R() < 0.6 && end - u > 1.2) {
          const n = Math.min(Math.floor((end - u) / 0.305), 6 + Math.floor(R() * 14));
          for (let k = 0; k < n; k += 1) {
            const [bx, by] = F.P(u + (k + 0.5) * 0.305, 0.19);
            if (!clearOfWalks(bx, by, 0.2)) continue;
            const [wx0, wy0] = F.P(u + (k + 0.5) * 0.305, 0);
            put('locker', wx0, wy0, 0, F.yaw, { color: bank });
          }
          u += n * 0.305 + 0.3;
          continue;
        }
        if (end - u < 1.3) break;
        const c = u + 0.65;
        const [bx, by] = F.P(c, 0);
        const f = R();
        if (!clearOfWalks(...F.P(c, 0.3), 0.6)) { u += 1.5; continue; }
        const poster = () => `poster${Math.floor(R() * 14)}`;
        if (f < 0.2) quadAt(`cork${Math.floor(R() * 4)}`, bx, by, 1.5, F.yaw, 1.2, 0.72);
        else if (f < 0.35) { put('bench', ...F.P(c, 0.02), 0, F.yaw); quadAt(poster(), bx, by, 1.55, F.yaw, 0.5, 0.7); }
        else if (f < 0.5) { put('trash', ...F.P(c - 0.25, 0.25), 0, 0); put('recycle', ...F.P(c + 0.25, 0.25), 0, 0, { color: '#2563eb' }); }
        else if (f < 0.6) put('fountain', bx, by, 0, F.yaw);
        else if (f < 0.72) { put('extinguisher', bx, by, 0, F.yaw); quadAt('extSign', bx, by, 1.75, F.yaw, 0.2, 0.3); }
        else if (f < 0.86 && stairFeet.length) {
          // A real sign: which way the nearest stairwell is, from here.
          const s = stairFeet.reduce((best, o) => (Math.hypot(o.p[0] - bx, o.p[1] - by) < Math.hypot(best.p[0] - bx, best.p[1] - by) ? o : best));
          const d = [-F.n[0], -F.n[1]], right = [-d[1], d[0]];
          const side = (s.p[0] - bx) * right[0] + (s.p[1] - by) * right[1] > 0 ? 'R' : 'L';
          quadAt(`dir:${s.name}:${side}`, bx, by, 2.15, F.yaw, 0.8, 0.16);
          quadAt(poster(), bx, by, 1.45, F.yaw, 0.5, 0.7);
        } else { quadAt(poster(), bx - 0, by, 1.55, F.yaw, 0.5, 0.7); }
        u += 1.5;
      }
    });

    // ── stairs ────────────────────────────────────────────────────────────
    const pits = [];
    function buildStair(s) {
      const q = s.q;
      const sides = sidesOf(q);
      const di = Math.max(0, s.owned.findIndex((o) => o.length));
      const F = roomFrame(q, sides[di]);
      const W = F.L, D = F.D;
      const du = ((sides[di].horiz ? s.landing[0] : s.landing[1]) - F.a0) / PXM;
      // the entry landing must hold the doorway, the router's landing point
      // and the step a walk takes past it
      const vLand = Math.abs((sides[di].horiz ? s.landing[1] : s.landing[0]) - (sides[di].fixed + sides[di].inward * WT)) / PXM;
      const eL = Math.max(clamp(D * 0.26, 1.2, 1.8), Math.max(vLand, STAIR_IN) + 0.6), mL = clamp(D * 0.2, 1.0, 1.5), Fl = D - eL - mL;
      const lbox = (ua, ub, va, vb, ya, yb, col, top) => {
        const a = F.P(ua, va), b = F.P(ub, vb);
        G.stairs.box(wx(a[0]), FY + ya * UM, wz(a[1]), wx(b[0]), FY + yb * UM, wz(b[1]), col, { top });
      };
      const pxRect = (ua, ub, va, vb) => {
        const a = F.P(ua, va), b = F.P(ub, vb);
        return { x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]), y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]) };
      };
      const landingRect = (topFloor && Fl >= 1.4 && W >= 1.6) ? pxRect(0, W, 0, eL) : q;
      const fm = box(group, landingRect.x1, landingRect.y1, landingRect.x2, landingRect.y2, FY, 0, mats.stair, false);
      fm.userData = { name: s.name, sub: 'connects to other floors' };
      pickables.push(fm);
      if (Fl < 1.4 || W < 1.6) return;

      const gap = 0.14, fw = (W - gap) / 2;
      const doorLow = du < W / 2;
      const A = doorLow ? [W - fw, W] : [0, fw];   // the first flight runs up the side away from the door
      const B = doorLow ? [0, fw] : [W - fw, W];
      const N = 9, rise = WALL_M / 2 / N, tr = Fl / N;
      const up = !topFloor, sg = up ? 1 : -1;
      const base = up ? 0 : -WALL_M - 0.1;
      const TREAD = '#6e7175', NOSE = '#e3b63b', BODY = '#b3afa6';
      for (let i = 0; i < N; i += 1) {
        const va = eL + i * tr, vb = va + tr, top = sg * (i + 1) * rise;
        lbox(A[0], A[1], va, vb, Math.min(base, top), top, BODY, TREAD);
        const nv = up ? va : vb - 0.05;
        lbox(A[0], A[1], nv, nv + 0.05, top, top + 0.006, NOSE);
      }
      lbox(0, W, eL + Fl, D, Math.min(base, sg * N * rise), sg * N * rise, BODY, TREAD);
      for (let j = 0; j < N; j += 1) {
        const vb = eL + Fl - j * tr, va = vb - tr, top = sg * (N + j + 1) * rise;
        lbox(B[0], B[1], va, vb, Math.min(base, top), top, BODY, TREAD);
        const nv = up ? vb - 0.05 : va;
        lbox(B[0], B[1], nv, nv + 0.05, top, top + 0.006, NOSE);
      }
      if (!up) {
        const pit = pxRect(0, W, eL, D);
        pits.push(pit);
        // the shaft's own walls, below the floor
        lbox(0, W, eL - 0.02, eL, base, 0, BODY);
        lbox(-0.02, 0, eL, D, base, 0, BODY);
        lbox(W, W + 0.02, eL, D, base, 0, BODY);
        lbox(0, W, D, D + 0.02, base, 0, BODY);
      }

      // railings: a guard up the middle, handrails on the walls
      const yA = (v) => sg * ((v - eL) / Fl) * N * rise;
      const yB = (v) => sg * (N * rise + ((eL + Fl - v) / Fl) * N * rise);
      const rail = (u, va, vb, yf, h) => {
        const ya = yf(va) + h, yb = yf(vb) + h;
        const [bx, by] = F.P(u, (va + vb) / 2);
        put('rail', bx, by, (ya + yb) / 2, F.yaw, { sz: Math.hypot(vb - va, yb - ya), pitch: -Math.atan2(yb - ya, vb - va) });
      };
      const posts = (u, va, vb, yf, h) => {
        for (let v = va + 0.05; v <= vb; v += 0.45) { const [bx, by] = F.P(u, v); put('post', bx, by, yf(v), 0, { sy: h }); }
      };
      const aIn = doorLow ? A[0] + 0.03 : A[1] - 0.03, bIn = doorLow ? B[1] - 0.03 : B[0] + 0.03;
      const aOut = doorLow ? A[1] - 0.06 : A[0] + 0.06, bOut = doorLow ? B[0] + 0.06 : B[1] - 0.06;
      [[aIn, yA], [bIn, yB]].forEach(([u, yf]) => { posts(u, eL, eL + Fl, yf, 0.95); rail(u, eL, eL + Fl, yf, 0.97); });
      rail(aOut, eL, eL + Fl, yA, 0.9);
      rail(bOut, eL, eL + Fl, yB, 0.9);
      if (!up) {
        // at the top of a stairwell there is only a way down: guard its edge
        const flat0 = () => 0;
        const [ga, gb] = [Math.min(B[0], B[1]), Math.max(B[0], B[1])];
        for (let u = ga + 0.05; u < gb; u += 0.3) { const [bx, by] = F.P(u, eL); put('post', bx, by, 0, 0, { sy: 1.05 }); }
        const [bx, by] = F.P((ga + gb) / 2, eL);
        put('rail', bx, by, 1.07, F.yaw + Math.PI / 2, { sz: gb - ga });
        posts(aIn, eL - 0.001, eL + 0.01, flat0, 1.05);
      }
    }
    stairs.forEach(buildStair);

    // ── floors ────────────────────────────────────────────────────────────
    const b = plan.bbox, pad = 60;
    rectSubtract({ x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad }, pits)
      .forEach((q) => G.slab.box(wx(q.x1), -0.4, wz(q.y1), wx(q.x2), 0, wz(q.y2), '#ffffff'));

    const floorUV = (tileM) => (p) => [p[0] / UM / tileM, p[2] / UM / tileM];
    rooms.forEach((r) => {
      const q = r.q;
      const [tex, rough] = floorTex(r.kind, r.name);
      const R = rng(hashStr(r.name));
      const tint = new THREE.Color().setHSL(0.1, 0.05, 0.94 + R() * 0.06);
      const mat = std({ map: tex, roughness: rough, color: tint });
      junk.push(mat);
      const g = new Geo(THREE);
      g.box(wx(q.x1), 0, wz(q.y1), wx(q.x2), FY, wz(q.y2), '#ffffff', { uv: floorUV(tex.userData.tileM) });
      const geo = g.build(); junk.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.userData = {
        name: r.name, room: r.name,
        sub: `${areaOf(q)} m² · ${r.doors.length} ${r.doors.length === 1 ? 'doorway' : 'doorways'}`,
      };
      group.add(m);
      pickables.push(m);
    });
    plan.HALLS.forEach((h) => {
      const g = new Geo(THREE);
      g.box(wx(h.x1), 0, wz(h.y1), wx(h.x2), FY + 0.002, wz(h.y2), '#ffffff', { uv: floorUV(T.hallFloor.userData.tileM) });
      const geo = g.build(); junk.push(geo);
      const m = new THREE.Mesh(geo, mats.hall);
      m.receiveShadow = true;
      m.userData = { name: 'Hallway', sub: 'open corridor' };
      halls.add(m);
      pickables.push(m);
    });
    linkRects.forEach((q) => G.links.box(wx(q.x1), 0, wz(q.y1), wx(q.x2), FY + 0.001, wz(q.y2), '#ffffff', { uv: floorUV(T.hallFloor.userData.tileM) }));

    // ── ceilings and lights ───────────────────────────────────────────────
    // Ceilings face down only: from above they are invisible, so the map
    // still reads as a plan, yet they cast shadows — daylight reaches the
    // floors through the windows, not through a missing roof.
    const troffer = (x, y, alongX) => {
      const q = around(x, y, alongX ? 0.6 : 0.3, alongX ? 0.3 : 0.6);
      flat(G.emit, q, TOP - 0.004, true);
      flat(G.pool, around(x, y, 1.5, 1.5), FY + 0.006, false);
      G.pool.uv.splice(G.pool.uv.length - 8, 8, 0, 0, 1, 0, 1, 1, 0, 1);
    };
    const vent = (x, y) => flat(G.vent, around(x, y, 0.3, 0.3), TOP - 0.003, true);
    const ceilOver = (q) => flat(G.ceil, q, TOP - 0.001, true, 1.2192);
    if (!lite) rooms.forEach((r) => {
      if (r.kind === 'courtyard') return;
      const q = r.q;
      ceilOver(q);
      const w = (q.x2 - q.x1) / PXM, d = (q.y2 - q.y1) / PXM;
      const nx = Math.max(1, Math.round(w / 2.4)), ny = Math.max(1, Math.round(d / 2.4));
      if (w < 1.2 || d < 1.2) return;
      for (let i = 0; i < nx; i += 1) {
        for (let j = 0; j < ny; j += 1) {
          const x = q.x1 + ((i + 0.5) * (q.x2 - q.x1)) / nx, y = q.y1 + ((j + 0.5) * (q.y2 - q.y1)) / ny;
          troffer(x, y, w >= d);
          if ((i + j) % 3 === 1 && w > 3 && d > 3) vent(x + (0.9 * PXM) * (w >= d ? 1 : 0), y + (0.9 * PXM) * (w >= d ? 0 : 1));
        }
      }
    });
    if (!lite) stairs.forEach((s) => ceilOver(s.q));
    (lite ? [] : [...plan.HALLS, ...linkRects]).forEach((h, hi) => {
      ceilOver(h);
      if (hi >= plan.HALLS.length) return;
      const alongX = h.x2 - h.x1 >= h.y2 - h.y1;
      const len = (alongX ? h.x2 - h.x1 : h.y2 - h.y1) / PXM;
      const n = Math.max(1, Math.round(len / 3));
      for (let k = 0; k < n; k += 1) {
        const t = (k + 0.5) / n;
        const x = alongX ? h.x1 + t * (h.x2 - h.x1) : (h.x1 + h.x2) / 2;
        const y = alongX ? (h.y1 + h.y2) / 2 : h.y1 + t * (h.y2 - h.y1);
        troffer(x, y, !alongX);
        if (k % 3 === 1) vent(x + (alongX ? 1.4 * PXM : 0), y + (alongX ? 0 : 1.4 * PXM));
      }
    });

    // ── build ─────────────────────────────────────────────────────────────
    const mesh = (geo, mat, parent, o = {}) => {
      if (geo.empty) return null;
      const g = geo.build(); junk.push(g);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false;
      if (o.order !== undefined) m.renderOrder = o.order;
      m.name = o.name || '';
      parent.add(m);
      return m;
    };
    mesh(G.slab, mats.slab, group);
    mesh(G.links, mats.hall, halls);
    mesh(G.hallW, mats.wallHall, walls, { cast: true, name: 'wall' });
    mesh(G.roomW, mats.wallRoom, walls, { cast: true, name: 'wall' });
    mesh(G.extW, mats.wallExt, walls, { cast: true, name: 'wall' });
    mesh(G.stairs, mats.stairs, group, { cast: true, name: 'stairs' });
    mesh(G.ao, mats.ao, group, { receive: false, order: 1 });
    mesh(G.blob, mats.blob, group, { receive: false, order: 2 });
    mesh(G.pool, mats.pool, group, { receive: false, order: 3 });
    mesh(G.ceil, mats.ceiling, tall, { cast: true, receive: false });
    mesh(G.emit, mats.emit, tall, { receive: false });
    mesh(G.vent, mats.vent, tall, { receive: false });
    if (!G.atlas.empty) mesh(G.atlas, atlasMat(), tall);
    mesh(G.glass, mats.glass, tall, { receive: false, order: 4 });

    const byPf = new Map();
    placed.forEach((p) => { if (!byPf.has(p.pf)) byPf.set(p.pf, []); byPf.get(p.pf).push(p); });
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler();
    const v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), c3 = new THREE.Color();
    byPf.forEach((list, key) => {
      const pf = prefabs[key];
      pf.parts.forEach((part) => {
        const im = new THREE.InstancedMesh(part.geo, mats[part.mat], list.length);
        im.name = key;
        list.forEach((p, i) => {
          eu.set(p.pitch, p.yaw, 0, 'YXZ');
          qt.setFromEuler(eu);
          m4.compose(v3.set(p.x, p.y, p.z), qt, s3.set(p.sx, p.sy, p.sz));
          im.setMatrixAt(i, m4);
          if (part.tint) im.setColorAt(i, c3.set(p.color || '#ffffff'));
        });
        im.castShadow = pf.shadow;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        junk.push(im);
        (WALL_MOUNTED.has(key) ? tall : group).add(im);
      });
    });

    if (withLabels) {
      rooms.forEach((r) => labels.add(label(r.name, r.q)));
      stairs.forEach((s) => labels.add(label(s.name.toUpperCase(), s.q)));
    }

    return { group, pickables, walls, labels, halls, tall };
  }

  /**
   * The walk itself, laid on the floor: a chevron ribbon along the waypoints
   * and a marker at each end. `points` are blueprint coordinates straight from
   * the router; when `plan` is given and an end is a room's doorway, the walk
   * is carried a step into the room, so START and the destination stand
   * inside the room rather than on its threshold.
   */
  function buildRoute(points, [startText, endText] = ['Start', 'Destination'], { zoom = 1, plan = null } = {}) {
    const group = new THREE.Group();
    if (!Array.isArray(points) || points.length < 2) return { group, bbox: null };

    const pts = points.map((p) => [p[0], p[1]]);
    const head = roomEntry(plan, pts[0]);
    if (head) pts.unshift(...head);
    const tail = roomEntry(plan, pts[pts.length - 1]);
    if (tail) pts.push(...tail.reverse());

    // `zoom` is how far the camera ends up sitting back: the ribbon grows a
    // little with it so a building-wide walk still reads at a glance — but
    // never wider than a classroom door.
    const W = clamp(3.6 * zoom, 5, 8);        // ribbon half-width, blueprint px
    const g = new Geo(THREE);
    for (let i = 1; i < pts.length; i += 1) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.5) continue;
      const d = [(bx - ax) / len, (by - ay) / len], p = [-d[1], d[0]];
      const y = FY + 0.012 + i * 0.0006;
      const A = [ax - d[0] * W, ay - d[1] * W], B = [bx + d[0] * W, by + d[1] * W];
      const P = (q, s) => [wx(q[0] + p[0] * W * s), y, wz(q[1] + p[1] * W * s)];
      const u1 = (len + 2 * W) / (8 * W);
      g.quad(P(A, 1), P(B, 1), P(B, -1), P(A, -1), [0, 1, 0], [[0, 1], [u1, 1], [u1, 0], [0, 0]]);
    }
    const geo = g.build(); junk.push(geo);
    const ribbon = new THREE.Mesh(geo, mats.path);
    ribbon.renderOrder = 5;
    group.add(ribbon);

    const pulses = [], plates = [];
    const marker = (p, color, text, lean) => {
      const r = clamp(0.2 * zoom, 0.3, 0.42);
      const m = new THREE.Group();
      m.position.set(wx(p[0]), FY, wz(p[1]));
      const flatMat = (opacity) => {
        const mt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
        junk.push(mt); return mt;
      };
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 40), flatMat(0.38));
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 48), flatMat(0.95));
      const pulse = new THREE.Mesh(new THREE.RingGeometry(r, r * 1.14, 48), flatMat(0.6));
      [disc, ring, pulse].forEach((o, k) => { o.rotation.x = -Math.PI / 2; o.position.y = 0.016 + k * 0.001; o.renderOrder = 6; junk.push(o.geometry); m.add(o); });
      pulses.push(pulse);
      const stemH = 1.35 * UM;
      const pinMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 });
      junk.push(pinMat);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, stemH, 10), pinMat);
      stem.position.y = stemH / 2;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), pinMat);
      knob.position.y = stemH + 0.1;
      [stem, knob].forEach((o) => { o.castShadow = true; junk.push(o.geometry); m.add(o); });
      group.add(m);

      const size = clamp(3.0 * zoom, 3.0, 4.4);
      const lift = size * 0.62 + r;
      const off = (lift / S) * lean;
      const q = { x1: p[0] - 150, x2: p[0] + 150, y1: p[1] - 150 + off, y2: p[1] + 150 + off };
      const plate = label(String(text).toUpperCase(), q, { y: FY + stemH + size * 0.55, minSize: size, maxSize: size, accent: color });
      plate.renderOrder = 24;
      plate.userData.home = { pos: plate.position.clone(), scale: plate.scale.clone() };
      plates.push(plate);
      group.add(plate);
    };
    marker(pts[0], COL.start, startText, -1);
    marker(pts[pts.length - 1], COL.end, endText, 1);

    group.userData = {
      path: pts.map((p) => [wx(p[0]), wz(p[1])]),
      plates,
      update(t) {
        pulses.forEach((o, k) => {
          const f = ((t * 0.7) + k * 0.5) % 1;
          const s = 1 + f * 1.1;
          o.scale.set(s, s, 1);
          o.material.opacity = 0.65 * (1 - f);
        });
      },
    };
    return { group, bbox: routeBBox(pts) };
  }

  function dispose() {
    junk.forEach((d) => d.dispose && d.dispose());
    junk.length = 0;
  }

  return { mats, buildFloor, buildRoute, label, box, dispose, track: (d) => junk.push(d) };
}

/**
 * Lighting for an interior: soft sky and bounce light, one warm sun whose
 * shadows only reach the floor through the windows (the ceilings block the
 * rest), and an environment map so vinyl and steel pick up soft reflections.
 * Pass the renderer to get tone mapping and the environment.
 */
export function addLights(THREE, scene, renderer, { env = true } = {}) {
  if (renderer) {
    // Nothing that casts a shadow ever moves, so the shadow map is drawn once
    // (on the first frame) instead of every frame. Callers that change what
    // is visible set renderer.shadowMap.needsUpdate.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  if (renderer && env) {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pm.fromScene(room, 0.04, 0.1, 100, { size: 128 }).texture;
    scene.environmentIntensity = 0.5;
    room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pm.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xf3f6fa, 0x7a7266, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(30, 34, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sd = 38;
  Object.assign(sun.shadow.camera, { left: -sd, right: sd, top: sd, bottom: -sd, far: 170 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcd3e6, 0.35);
  fill.position.set(-34, 22, -14);
  scene.add(fill);
}

/**
 * True when WebGL is running in software (no usable graphics card): there the
 * maps drop shadows and extra resolution, and the walk doesn't start on its
 * own — each eye-level frame would take the better part of a second.
 */
export function isSoftwareGL(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return /swiftshader|llvmpipe|software|basic render/i.test(String(name));
  } catch {
    return false;
  }
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
 */
export function frameOn(b, { pad = 0.06, floor: floorPad = 3, aspect = 1.6 } = {}) {
  const cx = (wx(b.x1) + wx(b.x2)) / 2;
  const cz = (wz(b.y1) + wz(b.y2)) / 2;
  const spanX = Math.abs(wx(b.x2) - wx(b.x1));
  const spanZ = Math.abs(wz(b.y2) - wz(b.y1));
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
 * drags into the 3D model from there. There is no zoom, by design.
 *
 * `onTap` makes the map clickable: it is handed the point on the floor in
 * blueprint coordinates, and only fires for a press that did not turn into a
 * drag. `setEnabled(false)` hands the camera to something else (the walk).
 */
export function orbitCamera(THREE, el, camera, fit, { keys = true, keyEl = el, onTap = null } = {}) {
  const target = new THREE.Vector3(fit.cx, 0.3, fit.cz);
  const sph = { r: fit.r, theta: Math.PI / 2, phi: 0.03 };
  let enabled = true;

  function apply() {
    sph.phi = Math.max(0.02, Math.min(1.5, sph.phi));
    camera.position.set(
      target.x + sph.r * Math.sin(sph.phi) * Math.cos(sph.theta),
      target.y + sph.r * Math.cos(sph.phi),
      target.z + sph.r * Math.sin(sph.phi) * Math.sin(sph.theta),
    );
    camera.lookAt(target);
  }

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FY);
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
    if (!enabled) return;
    el.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = true;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
  };
  const onMove = (e) => {
    if (!enabled || !drag || Object.keys(pointers).length > 1) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    sph.theta += dx * 0.006;
    sph.phi -= dy * 0.006;
    apply();
  };
  const release = (e) => {
    if (enabled && onTap && drag && Object.keys(pointers).length === 1
        && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) <= 4) {
      const p = floorPoint(e.clientX, e.clientY);
      if (p) onTap(p[0], p[1]);
    }
    delete pointers[e.pointerId];
    if (!Object.keys(pointers).length) drag = null;
  };
  const onCtx = (e) => e.preventDefault();
  const onKey = (e) => {
    if (!enabled) return;
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
  if (keys) keyEl.addEventListener('keydown', onKey);
  apply();

  return {
    apply,
    /** Re-fit after a resize, keeping whatever angle the student has turned to. */
    reframe(next) {
      target.set(next.cx, 0.3, next.cz);
      sph.r = next.r;
      if (enabled) apply();
    },
    setEnabled(on) {
      enabled = on;
      drag = null;
      if (on) apply();
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
