import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANS, createFloorKit, addLights, routeBBox, frameOn, orbitCamera, FOV } from '../lib/floorScene';
import styles from './RouteScene3D.module.css';

/* One floor of the building with a walk drawn on it — the map a student
   actually reads after finding a route.

   The waypoints are the router's own output in blueprint coordinates, and the
   floor is built from the same data the router walks, so the line on screen is
   the path it computed rather than a redrawing of it. */

// Frame the camera on the walk, not the whole floor: a short hop between two
// neighbouring rooms should not be a speck in the middle of the building. The
// floor of 16 is the shortest useful map — a hop across a corridor still shows
// the rooms either side of it, which is what tells you where you are.
function frameFor(bbox, plan) {
  const fit = frameOn(bbox || plan.bbox, { pad: 0.2, min: 16, floor: 4 });
  // Ribbon and marker weight follow the size of the walk, not the distance, so
  // a short hop keeps the same line thickness it always had.
  const weight = Math.max(0.42, (Math.max(fit.spanX, fit.spanZ) * 0.92 + 6) / 26);
  return { ...fit, weight };
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
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    addLights(THREE, scene);

    const kit = createFloorKit(THREE);
    const { group } = kit.buildFloor(plan);
    scene.add(group);

    // Frame first: the same measurement decides where the camera sits and how
    // heavily the walk is drawn.
    const fit = frameFor(routeBBox(points), plan);
    const { group: routeGroup } = kit.buildRoute(points, labels, { zoom: fit.weight });
    scene.add(routeGroup);

    // Opens as a top view — the way a floor plan is read. Dragging tilts it
    // down into the 3D model, a wheel or a pinch zooms.
    // Arrow keys are bound to the frame, which is the element that takes focus.
    const controls = orbitCamera(THREE, renderer.domElement, camera, fit, { keyEl: wrap });

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

    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); renderer.render(scene, camera); };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.detach();
      kit.dispose();
      renderer.dispose();
      const el = renderer.domElement;
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
      aria-label={caption || 'Route map. Drag to turn it, or use the arrow keys; plus and minus zoom.'}
    />
  );
}
