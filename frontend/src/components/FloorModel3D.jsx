import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANS, createFloorKit, addLights } from '../lib/floorScene';
import styles from './FloorModel3D.module.css';

/* ─────────────────────────────────────────────────────────────────────────
   A walkable 3D model of one floor at a time.

   The geometry comes from lib/floorScene.js, the same builder the route map
   uses, so the building looks identical whether you are exploring it here or
   following a computed walk. The plans behind it are derived from
   roomCoordinates.js by backend/scripts/buildFloorPlans.js — re-run that when
   the routing data changes and this follows.
   ───────────────────────────────────────────────────────────────────────── */

export default function FloorModel3D({ floor = 3, onSelect = null }) {
  const wrapRef = useRef(null);
  const apiRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Built once; switching floors only toggles visibility.
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
    addLights(THREE, scene, renderer);

    const kit = createFloorKit(THREE);

    const built = {};
    [1, 2, 3].forEach((f) => {
      built[f] = kit.buildFloor(PLANS[f]);
      // Measured off the geometry actually built: traced room outlines can run
      // past the plan's stored bounds, and those rooms must stay in frame.
      built[f].bounds = new THREE.Box3().setFromObject(built[f].walls);
      built[f].group.visible = false;
      scene.add(built[f].group);
    });

    // ── camera ───────────────────────────────────────────────────────────────
    const target = new THREE.Vector3(0, 2, 0);
    const sph = { r: 48, theta: Math.PI / 2, phi: 0.92 };
    let mode = 'angled';

    // Frame the whole of the floor being shown, whatever the window's shape.
    // The three floors are different sizes, so a fixed distance fits one and
    // crops the others. `margin` leaves room for the walls standing up from the
    // floor's edge, which the angled view sees side-on.
    const TAN = Math.tan((camera.fov / 2) * (Math.PI / 180));
    function frame(f, view = mode) {
      const b = built[f].bounds;
      const spanX = b.max.x - b.min.x;
      const spanZ = b.max.z - b.min.z;
      const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
      // The view buttons float over the map's right edge; frame the floor in
      // the space beside them rather than underneath them. On a narrow screen
      // there is no room to spare, so the floor takes the whole width.
      const panel = wrap.parentElement?.querySelector(`.${styles.panel}`);
      const reserve = panel && w > 640 ? panel.offsetWidth + 24 : 0;
      const margin = view === 'top' ? 1.08 : 1.2;
      const half = Math.max(spanZ / 2, spanX / 2 / ((w - reserve) / h)) * margin;
      const r = half / TAN + (view === 'top' ? 2 : 0);
      const shift = (reserve / 2) * ((2 * TAN * r) / h);
      target.set((b.min.x + b.max.x) / 2 + shift, view === 'top' ? 0 : 1, (b.min.z + b.max.z) / 2);
      sph.r = r;
      sph.phi = view === 'top' ? 0.03 : 0.72;
      sph.theta = Math.PI / 2;
      applyCam();
    }
    function applyCam() {
      sph.phi = Math.max(0.02, Math.min(1.55, sph.phi));
      sph.r = Math.max(10, Math.min(200, sph.r));
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
      frame(shown);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    frame(shown);

    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); renderer.render(scene, camera); };
    tick();

    apiRef.current = {
      show(f) {
        shown = f;
        [1, 2, 3].forEach((n) => { built[n].group.visible = n === f; });
        renderer.shadowMap.needsUpdate = true;
        clearHover();
        frame(f);
      },
      view(kind) {
        mode = kind === 'top' ? 'top' : 'angled';
        frame(shown);
      },
      setLabels(on) { [1, 2, 3].forEach((n) => { built[n].labels.visible = on; }); },
      setWalls(low) {
        const k = low ? 0.34 : 1;
        [1, 2, 3].forEach((n) => {
          built[n].walls.scale.y = k;
          built[n].walls.position.y = 0.06 * (1 - k);
          // doors, windows and railings would float or clip
          built[n].tall.visible = !low;
          renderer.shadowMap.needsUpdate = true;
        });
      },
      setHalls(hot) {
        kit.mats.hall.color.setHex(hot ? 0x7cc4f2 : 0xffffff);
        kit.mats.hall.emissive.setHex(hot ? 0x123a55 : 0x000000);
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
      kit.dispose();
      scene.environment?.dispose();
      renderer.dispose();
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
