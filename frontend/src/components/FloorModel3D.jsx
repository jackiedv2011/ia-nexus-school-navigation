import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import PLANS from '../lib/floorPlans.json';
import styles from './FloorModel3D.module.css';

/* ─────────────────────────────────────────────────────────────────────────
   A walkable 3D model of one floor, built from the SAME corridors, doorways
   and stair landings the route finder walks (backend/data/roomCoordinates.js,
   baked out by backend/scripts/buildFloorPlans.js). If the routing data
   changes, re-run that script and this model changes with it.

   The building records doorway POINTS, never room outlines, so room shapes
   here are inferred — positions and which corridor a room opens onto are
   exact, wall-to-wall dimensions are a reconstruction.
   ───────────────────────────────────────────────────────────────────────── */

const M_PER_PX = 140 / 2448;          // the scale the router measures in
const S = 0.028;                      // blueprint px -> world units
const WALL_H = 1.5;
const WT = 5;                         // half wall thickness, in blueprint px
const DOOR_HALF = 26;                 // half a doorway opening
const HALL_HALF = 23;

const COL = {
  room: 0xc9d8e8, lib: 0xbfd8c6, stair: 0xe8d5b7, hall: 0x8d9aa6,
  wall: 0xf3f1ec, door: 0xe0a253, slab: 0x4f5b66,
};

const isLib = (n) => /xchange/i.test(n);
const areaOf = (q) => Math.round((q.x2 - q.x1) * (q.y2 - q.y1) * M_PER_PX * M_PER_PX);

// Every floor shares one origin so switching between them doesn't shift the view.
const UNION = [1, 2, 3].reduce((u, f) => {
  const b = PLANS[f].bbox;
  return {
    x1: Math.min(u.x1, b.x1), y1: Math.min(u.y1, b.y1),
    x2: Math.max(u.x2, b.x2), y2: Math.max(u.y2, b.y2),
  };
}, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });

const CX = (UNION.x1 + UNION.x2) / 2;
const CY = (UNION.y1 + UNION.y2) / 2;
const wx = (p) => (p - CX) * S;
const wz = (p) => (p - CY) * S;

// The four walls of a rectangle, each with the direction its room lies in.
function sidesOf(q) {
  return [
    { horiz: true,  fixed: q.y1, a: q.x1, b: q.x2, inward:  1 },
    { horiz: true,  fixed: q.y2, a: q.x1, b: q.x2, inward: -1 },
    { horiz: false, fixed: q.x1, a: q.y1, b: q.y2, inward:  1 },
    { horiz: false, fixed: q.x2, a: q.y1, b: q.y2, inward: -1 },
  ];
}

export default function FloorModel3D({ floor = 3, onSelect = null }) {
  const wrapRef = useRef(null);
  const apiRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Build the scene once; switching floors just toggles visibility.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);           // no WebGL — the page still works without the model
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x131a21, 80, 190);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);

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

    // one set of materials, so a toggle changes every floor at once
    const mats = {
      wall:   new THREE.MeshStandardMaterial({ color: COL.wall,  roughness: 0.94 }),
      hall:   new THREE.MeshStandardMaterial({ color: COL.hall,  roughness: 0.9 }),
      door:   new THREE.MeshStandardMaterial({ color: COL.door,  roughness: 0.55 }),
      stair:  new THREE.MeshStandardMaterial({ color: COL.stair, roughness: 0.85 }),
      slab:   new THREE.MeshStandardMaterial({ color: COL.slab,  roughness: 0.96 }),
      arc:    new THREE.MeshBasicMaterial({ color: 0xf0b263, transparent: true, opacity: 0.95 }),
      nosing: new THREE.MeshBasicMaterial({ color: 0x8d7a58 }),
    };
    const disposables = [renderer, ...Object.values(mats)];

    function boxIn(g, x1, y1, x2, y2, h, yBase, mat, shadow) {
      const w = Math.abs(wx(x2) - wx(x1));
      const d = Math.abs(wz(y2) - wz(y1));
      const geo = new THREE.BoxGeometry(w || 0.01, h, d || 0.01);
      disposables.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((wx(x1) + wx(x2)) / 2, yBase + h / 2, (wz(y1) + wz(y2)) / 2);
      m.receiveShadow = true;
      if (shadow) m.castShadow = true;
      g.add(m);
      return m;
    }

    function makeLabel(text, q) {
      // "Mission Control" gets two lines; the font then shrinks until the
      // longest line fits, so a name is never clipped.
      let lines = isLib(text) ? ['XCHANGE', 'LIBRARY']
        : (text.length > 8 && text.includes(' ') ? text.split(/\s+/) : [text]);
      if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')];

      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 256;
      const c = cv.getContext('2d');
      const bw = 470, pad = 34;
      const font = (px) => `700 ${px}px "Avenir Next", Helvetica, Arial, sans-serif`;
      let px = lines.length > 1 ? 56 : 78;
      c.font = font(px);
      const widest = Math.max(...lines.map((l) => c.measureText(l).width));
      if (widest > bw - pad) { px = Math.floor((px * (bw - pad)) / widest); c.font = font(px); }

      const lh = px * 1.12;
      const bh = lines.length * lh + 34;
      c.fillStyle = 'rgba(14,20,27,.86)';
      c.fillRect((512 - bw) / 2, (256 - bh) / 2, bw, bh);
      c.fillStyle = '#f4f7fa';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      lines.forEach((l, i) => c.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * lh));

      const tex = new THREE.CanvasTexture(cv);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      disposables.push(tex, mat);
      const sp = new THREE.Sprite(mat);
      // Size off the room's LONG side: a narrow room is still long enough to
      // carry a readable name.
      const w = Math.abs(wx(q.x2) - wx(q.x1));
      const d = Math.abs(wz(q.y2) - wz(q.y1));
      const size = Math.max(2.2, Math.min(3.4, Math.max(w, d) * 0.5));
      sp.scale.set(size, size / 2, 1);
      sp.position.set((wx(q.x1) + wx(q.x2)) / 2, WALL_H + 1.0, (wz(q.y1) + wz(q.y2)) / 2);
      sp.renderOrder = 20;
      return sp;
    }

    function buildOneFloor(plan) {
      const g = new THREE.Group();
      const walls = new THREE.Group();
      const labels = new THREE.Group();
      const halls = new THREE.Group();
      g.add(walls, labels, halls);
      const pickables = [];

      const b = plan.bbox, pad = 60;
      boxIn(g, b.x1 - pad, b.y1 - pad, b.x2 + pad, b.y2 + pad, 0.4, -0.4, mats.slab, false);

      plan.HALLS.forEach((h) => {
        const m = boxIn(halls, h.x1, h.y1, h.x2, h.y2, 0.06, 0, mats.hall, false);
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
        boxIn(halls, x1, y1, x2, y2, 0.06, 0, mats.hall, false);
      };
      plan.DOORS.forEach((d) => link(d.at, d.foot));
      plan.STAIRS.forEach((s) => link(s.landing, s.foot));

      const run = (s, a, bb) => {
        if (bb - a < 0.5) return;
        if (s.horiz) boxIn(walls, a, s.fixed - WT, bb, s.fixed + WT, WALL_H, 0.06, mats.wall, true);
        else         boxIn(walls, s.fixed - WT, a, s.fixed + WT, bb, WALL_H, 0.06, mats.wall, true);
      };
      // the lintel over an opening, so a wall still reads as continuous
      const header = (s, a, bb) => {
        const y = 0.06 + WALL_H - 0.2;
        if (s.horiz) boxIn(walls, a, s.fixed - WT, bb, s.fixed + WT, 0.2, y, mats.wall, true);
        else         boxIn(walls, s.fixed - WT, a, s.fixed + WT, bb, 0.2, y, mats.wall, true);
      };

      // a real door: the leaf standing open at 90°, and its swing arc
      function leaf(s, a, bb) {
        const w = bb - a, dir = s.inward, f = s.fixed;
        const hx = s.horiz ? a : f;
        const hz = s.horiz ? f : a;
        const p1 = s.horiz ? [a - 3, f] : [f, a - 3];
        const p2 = s.horiz ? [a + 3, f + dir * w] : [f + dir * w, a + 3];
        boxIn(g, Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]),
                 Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1]),
              WALL_H - 0.3, 0.06, mats.door, true);

        const r = Math.abs(w) * S;
        const geo = new THREE.RingGeometry(r - 0.045, r, 40, 1, 0, Math.PI / 2);
        disposables.push(geo);
        const arc = new THREE.Mesh(geo, mats.arc);
        arc.rotation.x = -Math.PI / 2;
        arc.position.set(wx(hx), 0.135, wz(hz));
        // turn the quarter so it runs from the open leaf round to the jamb
        const tip2   = s.horiz ? [wx(hx), wz(f + dir * w)] : [wx(f + dir * w), wz(hz)];
        const closed = s.horiz ? [wx(bb), wz(f)]           : [wx(f), wz(bb)];
        const A = Math.atan2(-(tip2[1] - wz(hz)), tip2[0] - wx(hx));
        const C = Math.atan2(-(closed[1] - wz(hz)), closed[0] - wx(hx));
        const turn = (((C - A) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        arc.rotation.z = turn > Math.PI ? C : A;
        g.add(arc);
      }

      function build(q, doors, withLeaves) {
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
        disposables.push(mat);
        const m = boxIn(g, q.x1, q.y1, q.x2, q.y2, 0.09, 0.01, mat, false);
        m.userData = {
          name: r.name, room: r.name,
          sub: `${areaOf(q)} m² · ${r.doors.length} ${r.doors.length === 1 ? 'doorway' : 'doorways'}`,
        };
        pickables.push(m);
        build(q, r.doors, true);
        labels.add(makeLabel(r.name, q));
      });

      plan.STAIRS.forEach((s) => {
        const q = s.rect;
        const m = boxIn(g, q.x1, q.y1, q.x2, q.y2, 0.09, 0.01, mats.stair, false);
        m.userData = { name: s.name, sub: 'connects to other floors' };
        pickables.push(m);
        build(q, [s.landing], true);

        const inset = 16, treads = 9;
        const x1 = q.x1 + inset, x2 = q.x2 - inset;
        const y1 = q.y1 + inset, y2 = q.y2 - inset;
        const alongY = y2 - y1 >= x2 - x1;
        for (let i = 0; i < treads; i += 1) {
          const t0 = i / treads, t1 = (i + 1) / treads;
          const h = 0.1 + (s.side > 0 ? treads - i : i + 1) * 0.05;
          if (alongY) boxIn(g, x1, y1 + (y2 - y1) * t0, x2, y1 + (y2 - y1) * t1, h, 0.1, mats.stair, true);
          else        boxIn(g, x1 + (x2 - x1) * t0, y1, x1 + (x2 - x1) * t1, y2, h, 0.1, mats.stair, true);
          // a nosing, so treads read as steps from straight above
          if (i > 0) {
            const e = 3.5;
            if (alongY) boxIn(g, x1, y1 + (y2 - y1) * t0 - e, x2, y1 + (y2 - y1) * t0 + e, 0.02, 0.1 + h, mats.nosing, false);
            else        boxIn(g, x1 + (x2 - x1) * t0 - e, y1, x1 + (x2 - x1) * t0 + e, y2, 0.02, 0.1 + h, mats.nosing, false);
          }
        }
        labels.add(makeLabel(s.name.toUpperCase(), q));
      });

      return { group: g, pickables, walls, labels };
    }

    const built = {};
    [1, 2, 3].forEach((f) => {
      built[f] = buildOneFloor(PLANS[f]);
      built[f].group.visible = false;
      scene.add(built[f].group);
    });

    // ── camera ───────────────────────────────────────────────────────────────
    const target = new THREE.Vector3(0, 2, 0);
    // Framed for a page panel rather than a full window, so the floor fills it.
    const sph = { r: 48, theta: Math.PI / 2, phi: 0.92 };
    function applyCam() {
      sph.phi = Math.max(0.02, Math.min(1.55, sph.phi));
      sph.r = Math.max(14, Math.min(200, sph.r));
      camera.position.set(
        target.x + sph.r * Math.sin(sph.phi) * Math.cos(sph.theta),
        target.y + sph.r * Math.cos(sph.phi),
        target.z + sph.r * Math.sin(sph.phi) * Math.sin(sph.theta),
      );
      camera.lookAt(target);
    }

    const el = renderer.domElement;
    let drag = null;
    const pointers = {};
    let pinch = 0;
    let shown = floor;
    let hovered = null;

    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function clearHover() {
      if (hovered) { hovered.material.emissive.setHex(0x000000); hovered = null; }
      setTip(null);
    }

    function hover(e) {
      const r = el.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(built[shown].pickables)[0];
      if (hovered && (!hit || hit.object !== hovered)) clearHover();
      if (hit && hit.object !== hovered) {
        hovered = hit.object;
        hovered.material.emissive.setHex(0x3a5470);
      }
      if (hovered) {
        setTip({
          name: hovered.userData.name,
          sub: hovered.userData.sub,
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        });
      }
    }

    const onDown = (e) => {
      el.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, moved: false };
    };
    const onMove = (e) => {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      const ids = Object.keys(pointers);
      if (ids.length === 2) {
        const a = pointers[ids[0]], b2 = pointers[ids[1]];
        const dist = Math.hypot(a.x - b2.x, a.y - b2.y);
        if (pinch) sph.r *= pinch / dist;
        pinch = dist; applyCam(); return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        if (drag.pan) {
          const k = sph.r * 0.0016;
          target.x -= (dx * Math.sin(sph.theta) - dy * Math.cos(sph.theta) * Math.cos(sph.phi)) * k;
          target.z += (dx * Math.cos(sph.theta) + dy * Math.sin(sph.theta) * Math.cos(sph.phi)) * k;
        } else { sph.theta += dx * 0.006; sph.phi -= dy * 0.006; }
        applyCam();
      } else hover(e);
    };
    const onUp = (e) => {
      // a click that didn't drag is a selection
      if (drag && !drag.moved && hovered && hovered.userData.room && onSelect) {
        onSelect(hovered.userData.room, shown);
      }
      delete pointers[e.pointerId];
      if (!Object.keys(pointers).length) { drag = null; pinch = 0; }
    };
    const onCancel = (e) => {
      delete pointers[e.pointerId];
      if (!Object.keys(pointers).length) { drag = null; pinch = 0; }
    };
    const onCtx = (e) => e.preventDefault();
    const onWheel = (e) => { e.preventDefault(); sph.r *= 1 + Math.sign(e.deltaY) * 0.09; applyCam(); };
    const onLeave = () => clearHover();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('contextmenu', onCtx);
    el.addEventListener('wheel', onWheel, { passive: false });

    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    applyCam();

    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); renderer.render(scene, camera); };
    tick();

    apiRef.current = {
      show(f) {
        shown = f;
        [1, 2, 3].forEach((n) => { built[n].group.visible = n === f; });
        clearHover();
      },
      view(kind) {
        if (kind === 'top') { sph.phi = 0.03; sph.r = 44; target.set(0, 0, 0); }
        else                { sph.phi = 0.92; sph.r = 48; target.set(0, 2, 0); }
        sph.theta = Math.PI / 2;
        applyCam();
      },
      setLabels(on) { [1, 2, 3].forEach((n) => { built[n].labels.visible = on; }); },
      setWalls(low) {
        const k = low ? 0.34 : 1;
        [1, 2, 3].forEach((n) => {
          built[n].walls.scale.y = k;
          built[n].walls.position.y = 0.06 * (1 - k);
        });
      },
      setHalls(hot) {
        mats.hall.color.setHex(hot ? 0x5fb0e8 : COL.hall);
        mats.hall.emissive.setHex(hot ? 0x123a55 : 0x000000);
      },
    };
    apiRef.current.show(floor);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('contextmenu', onCtx);
      el.removeEventListener('wheel', onWheel);
      disposables.forEach((d) => d.dispose && d.dispose());
      if (el.parentNode === wrap) wrap.removeChild(el);
      apiRef.current = null;
    };
    // Built once. Floor changes go through the imperative handle below so we
    // never tear down and rebuild the whole scene just to switch floors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { apiRef.current?.show(floor); }, [floor]);

  return (
    <div className={styles.stage}>
      <div ref={wrapRef} className={styles.canvas} />
      {failed && (
        <p className={styles.fallback}>
          This browser can’t display the 3D model. The flat floor plans in the
          Route Finder show the same rooms and hallways.
        </p>
      )}
      {!ready && !failed && <p className={styles.fallback}>Loading model…</p>}
      {tip && (
        <div className={styles.tip} style={{ left: tip.x, top: tip.y }}>
          <b>{tip.name}</b> <em>{tip.sub}</em>
        </div>
      )}
      <FloorControls api={apiRef} />
    </div>
  );
}

function FloorControls({ api }) {
  const [labels, setLabels] = useState(true);
  const [low, setLow] = useState(false);
  const [hot, setHot] = useState(false);

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.btn} onClick={() => api.current?.view('iso')}>
        Angled view
      </button>
      <button type="button" className={styles.btn} onClick={() => api.current?.view('top')}>
        Top-down
      </button>
      <button
        type="button"
        className={`${styles.btn} ${low ? styles.btnOn : ''}`}
        onClick={() => { const v = !low; setLow(v); api.current?.setWalls(v); }}
      >
        {low ? 'Raise walls' : 'Lower walls'}
      </button>
      <button
        type="button"
        className={`${styles.btn} ${labels ? '' : styles.btnOn}`}
        onClick={() => { const v = !labels; setLabels(v); api.current?.setLabels(v); }}
      >
        {labels ? 'Hide labels' : 'Show labels'}
      </button>
      <button
        type="button"
        className={`${styles.btn} ${hot ? styles.btnOn : ''}`}
        onClick={() => { const v = !hot; setHot(v); api.current?.setHalls(v); }}
      >
        Highlight hallways
      </button>
    </div>
  );
}
