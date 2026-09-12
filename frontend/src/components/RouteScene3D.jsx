import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANS, createFloorKit, addLights, routeBBox, wx, wz } from '../lib/floorScene';
import styles from './RouteScene3D.module.css';

/* One floor of the building with a walk drawn on it — the map a student
   actually reads after finding a route.

   The waypoints are the router's own output in blueprint coordinates, and the
   floor is built from the same data the router walks, so the line on screen is
   the path it computed rather than a redrawing of it. */

// Frame the camera on the walk, not the whole floor: a short hop between two
// neighbouring rooms should not be a speck in the middle of the building.
function frameFor(bbox, plan) {
  const b = bbox || plan.bbox;
  const cx = (wx(b.x1) + wx(b.x2)) / 2;
  const cz = (wz(b.y1) + wz(b.y2)) / 2;
  const spanX = Math.abs(wx(b.x2) - wx(b.x1));
  const spanZ = Math.abs(wz(b.y2) - wz(b.y1));
  // enough distance to hold the longer side with a little air, and never so
  // close that the walls swallow the view
  const r = Math.max(11, Math.max(spanX, spanZ) * 0.92 + 6);
  return { cx, cz, r };
}

export default function RouteScene3D({ floor, points, labels, caption }) {
  const wrapRef = useRef(null);
  const [failed, setFailed] = useState(false);

  // Callers pass `points` and `labels` as literals, so they are a new array on
  // every render. Keying the effect on their VALUE stops a parent re-render
  // from tearing down and rebuilding the whole scene.
  const sig = JSON.stringify([floor, points, labels]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    const plan = PLANS[floor] || PLANS[1];
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);       // no WebGL — the caller still shows the written directions
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    addLights(THREE, scene);

    const kit = createFloorKit(THREE);
    const { group } = kit.buildFloor(plan);
    scene.add(group);

    // Frame first, so the walk is drawn at a weight that suits the distance the
    // camera ends up at.
    const fit = frameFor(routeBBox(points), plan);
    const { group: routeGroup } = kit.buildRoute(points, labels, { zoom: fit.r / 26 });
    scene.add(routeGroup);

    const target = new THREE.Vector3(fit.cx, 1.2, fit.cz);
    const sph = { r: fit.r, theta: Math.PI / 2, phi: 0.62 };

    function applyCam() {
      sph.phi = Math.max(0.02, Math.min(1.5, sph.phi));
      sph.r = Math.max(6, Math.min(220, sph.r));
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

    const onDown = (e) => {
      el.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    };
    const onMove = (e) => {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      const ids = Object.keys(pointers);
      if (ids.length === 2) {
        const a = pointers[ids[0]], b = pointers[ids[1]];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) sph.r *= pinch / dist;
        pinch = dist; applyCam(); return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) {
        const k = sph.r * 0.0016;
        target.x -= (dx * Math.sin(sph.theta) - dy * Math.cos(sph.theta) * Math.cos(sph.phi)) * k;
        target.z += (dx * Math.cos(sph.theta) + dy * Math.sin(sph.theta) * Math.cos(sph.phi)) * k;
      } else { sph.theta += dx * 0.006; sph.phi -= dy * 0.006; }
      applyCam();
    };
    const release = (e) => {
      delete pointers[e.pointerId];
      if (!Object.keys(pointers).length) { drag = null; pinch = 0; }
    };
    const onCtx = (e) => e.preventDefault();
    const onWheel = (e) => { e.preventDefault(); sph.r *= 1 + Math.sign(e.deltaY) * 0.1; applyCam(); };
    // Keyboard: the map is a figure, but turning it should not need a mouse.
    const onKey = (e) => {
      const step = 0.12;
      if (e.key === 'ArrowLeft')  { sph.theta -= step; }
      else if (e.key === 'ArrowRight') { sph.theta += step; }
      else if (e.key === 'ArrowUp')    { sph.phi -= step; }
      else if (e.key === 'ArrowDown')  { sph.phi += step; }
      else if (e.key === '+' || e.key === '=') { sph.r *= 0.88; }
      else if (e.key === '-' || e.key === '_') { sph.r *= 1.14; }
      else return;
      e.preventDefault();
      applyCam();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', onCtx);
    el.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('keydown', onKey);

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

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('contextmenu', onCtx);
      el.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('keydown', onKey);
      kit.dispose();
      renderer.dispose();
      if (el.parentNode === wrap) wrap.removeChild(el);
    };
    // Rebuilt only when the route or floor actually changes; `sig` carries the
    // value of all three.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  if (failed) {
    return (
      <p className={styles.fallback}>
        This browser can’t display the map. The written directions above still
        describe the whole route.
      </p>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={styles.stage}
      tabIndex={0}
      aria-label={caption || 'Route map. Use the arrow keys to turn it, plus and minus to zoom.'}
    />
  );
}
