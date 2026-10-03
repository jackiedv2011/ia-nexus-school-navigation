import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANS, createFloorKit, addLights, frameOn, orbitCamera, isSoftwareGL, FOV, FY } from '../lib/floorScene';
import { UM } from '../lib/scene/units';
import styles from './RouteScene3D.module.css';

/* One floor of the building with a walk drawn on it — the map a student
   actually reads after finding a route.

   The waypoints are the router's own output in blueprint coordinates, and the
   floor is built from the same data the router walks, so the line on screen is
   the path it computed rather than a redrawing of it.

   "Walk the route" drops the camera to eye height and follows that same line
   through the corridors, so the student sees the doors, lockers and signs
   they will actually pass. */

// The whole floor, every time. The map doesn't zoom, so the frame it opens at
// is the only view there is.
const frameFor = (plan, aspect) => frameOn(plan.bbox, { aspect });

const EYE = FY + 1.6 * UM;
const SPEED = 3.4 * UM;        // world units per second: a brisk walk, a little quicker than life

export default function RouteScene3D({ floor, points, labels, caption, play = false, onDone }) {
  const wrapRef = useRef(null);
  // `play` starts the walk on its own, like a video of the route; `onDone`
  // hears when it arrives (the next floor's map picks up from there).
  const playRef = useRef(play);
  playRef.current = play;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const apiRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [walk, setWalk] = useState('off');   // 'off' | 'walking' | 'arrived'

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
    const soft = isSoftwareGL(renderer);
    renderer.setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !soft;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    const fit = frameFor(plan, wrap.clientWidth / (wrap.clientHeight || 1));
    const controls = orbitCamera(THREE, renderer.domElement, camera, fit, { keyEl: wrap });

    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      controls.reframe(frameFor(plan, w / h));
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // The heavy part — lighting, textures, the furnished floor and the walk —
    // waits one tick, so the canvas and its controls are live straight away
    // (and React's development double-mount never pays for a build it drops).
    let kit = null, built = null, route = null;
    let path = [], cum = [0], total = 0, plates = [];
    const timer = setTimeout(() => {
      addLights(THREE, scene, renderer, { env: !soft });
      kit = createFloorKit(THREE);
      built = kit.buildFloor(plan, { lite: soft });
      scene.add(built.group);
      route = kit.buildRoute(points, labels, { zoom: fit.r / 26, plan });
      scene.add(route.group);
      path = route.group.userData.path || [];
      plates = route.group.userData.plates || [];
      for (let i = 1; i < path.length; i += 1) {
        cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      }
      total = cum[cum.length - 1] || 0;
      apiRef.current.ready = true;
      apiRef.current.soft = soft;
      if (playRef.current && !soft) { wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); apiRef.current.start(); }
    }, 0);

    // ── the walk ────────────────────────────────────────────────────────────
    const at = (s) => {
      const d = Math.max(0, Math.min(total, s));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i += 1;
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (d - cum[i - 1]) / seg;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    };
    const walker = { on: false, s: 0, dir: new THREE.Vector2(0, -1) };

    function setWalkView(on) {
      if (built) built.labels.visible = !on;
      camera.fov = on ? 72 : FOV;
      camera.near = on ? 0.03 : 0.1;
      camera.updateProjectionMatrix();
      plates.forEach((p, k) => {
        const home = p.userData.home;
        if (!on) { p.position.copy(home.pos); p.scale.copy(home.scale); p.visible = true; return; }
        // up close the plates shrink to sign size; the destination's stays
        // visible through the walls as the thing to head for
        p.visible = k === 1;
        const end = path[path.length - 1];
        p.position.set(end[0], FY + 2.4 * UM, end[1]);
        p.scale.set(0.9, 0.45, 1);
      });
    }
    apiRef.current = {
      start() {
        if (total <= 0) return;
        walker.on = true; walker.s = 0;
        const a = at(0), b = at(0.4);
        walker.dir.set(b[0] - a[0], b[1] - a[1]).normalize();
        controls.setEnabled(false);
        setWalkView(true);
        setWalk('walking');
      },
      stop() {
        walker.on = false;
        setWalkView(false);
        controls.setEnabled(true);
        setWalk('off');
      },
    };

    // A cross-floor route has two maps; don't draw the one scrolled away.
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });
    io.observe(wrap);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      route?.group.userData.update?.(clock.elapsedTime);
      if (walker.on) {
        if (walker.s < total && onScreen) {
          walker.s = Math.min(total, walker.s + SPEED * dt);
          if (walker.s >= total) { setWalk('arrived'); doneRef.current?.(); }
        }
        const p = at(walker.s);
        const ahead = at(walker.s + 1.6 * UM);
        const want = new THREE.Vector2(ahead[0] - p[0], ahead[1] - p[1]);
        if (want.lengthSq() > 1e-6) {
          want.normalize();
          walker.dir.lerp(want, 1 - Math.exp(-dt * 4)).normalize();
        }
        camera.position.set(p[0], EYE, p[1]);
        camera.lookAt(p[0] + walker.dir.x, EYE - 0.12, p[1] + walker.dir.y);
      }
      if (onScreen) renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.detach();
      apiRef.current = null;
      setWalk('off');
      clearTimeout(timer);
      kit?.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      const el = renderer.domElement;
      if (el.parentNode === wrap) wrap.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Asked to play (a route was just found, or the previous floor's walk
  // arrived): bring the map into view and start walking once it is built.
  useEffect(() => {
    if (!play) return;
    if (!apiRef.current?.ready || apiRef.current.soft) return;   // the build starts it
    wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    apiRef.current.start();
  }, [play]);

  if (failed) {
    return (
      <p className={styles.fallback}>
        This browser can’t display the map. The written directions above still
        describe the whole route.
      </p>
    );
  }

  const hasWalk = Array.isArray(points) && points.length > 1;
  return (
    <div
      ref={wrapRef}
      className={styles.stage}
      tabIndex={0}
      aria-label={caption || 'Route map. Drag to turn it, or use the arrow keys.'}
    >
      {hasWalk && (
        <div className={styles.walkBar}>
          {walk === 'off' ? (
            <button type="button" className={styles.walkBtn} onClick={() => apiRef.current?.start()}>
              ▶ Walk the route
            </button>
          ) : (
            <>
              {walk === 'arrived' && <span className={styles.walkNote}>You’ve arrived</span>}
              {walk === 'arrived' && (
                <button type="button" className={styles.walkBtn} onClick={() => apiRef.current?.start()}>
                  ↻ Replay
                </button>
              )}
              <button type="button" className={styles.walkBtn} onClick={() => apiRef.current?.stop()}>
                ✕ Back to map
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
