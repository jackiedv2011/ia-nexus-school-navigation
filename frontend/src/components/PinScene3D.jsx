import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PLANS, createFloorKit, addLights, wx, wz, S, CX, CY } from '../lib/floorScene';
import styles from './PinScene3D.module.css';

/* The floor you drop a pin on — the same 3D model the route is drawn on, seen
   straight down.

   The camera is orthographic and locked overhead, which is what makes a tap
   mean something: with no perspective and no orbit, a point on screen maps to a
   point on the floor by plain arithmetic, so there is no picking to get wrong
   and the pin lands exactly where the finger went. That is also why this is a
   separate component from RouteScene3D, which is free to be turned. */

// Fit the floor into the frame and report the mapping a tap needs.
function fitCamera(camera, plan, w, h) {
  const b = plan.bbox;
  const cx = (wx(b.x1) + wx(b.x2)) / 2;
  const cz = (wz(b.y1) + wz(b.y2)) / 2;
  const spanX = Math.abs(wx(b.x2) - wx(b.x1)) * 1.05;
  const spanZ = Math.abs(wz(b.y2) - wz(b.y1)) * 1.05;

  // Widen whichever axis has room, so the plan is contained rather than cropped.
  const aspect = (w || 1) / (h || 1);
  let halfW = spanX / 2;
  let halfH = spanZ / 2;
  if (halfW / halfH < aspect) halfW = halfH * aspect;
  else halfH = halfW / aspect;

  camera.left = -halfW; camera.right = halfW;
  camera.top = halfH;   camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  // up = -z keeps north at the top, so the model matches the plan the student
  // sees everywhere else in the app.
  camera.up.set(0, 0, -1);
  camera.position.set(cx, 60, cz);
  camera.lookAt(cx, 0, cz);
  return { cx, cz, halfW, halfH };
}

export default function PinScene3D({ floor, pin, color, onPick, onFail }) {
  const wrapRef = useRef(null);
  const viewRef = useRef(null);   // the live camera mapping, for hit-testing taps
  const pinRef = useRef(null);
  const redrawRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const plan = PLANS[floor] || PLANS[1];

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onFail?.();            // no WebGL — the caller falls back to the flat plan
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    wrap.appendChild(renderer.domElement);
    addLights(THREE, scene);

    const kit = createFloorKit(THREE);
    const { group } = kit.buildFloor(plan);
    scene.add(group);

    // One pin, moved rather than rebuilt: dropping it again must not cost a
    // teardown of the whole floor.
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 22, 16),
      new THREE.MeshBasicMaterial({ color: 0x16a34a, depthTest: false }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 40),
      new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;          // just clear of the floor slab
    const marker = new THREE.Group();
    marker.add(head, ring);
    marker.visible = false;
    // Drawn last and without a depth test: the pin is the one thing that must
    // never end up behind a wall or under a room's name plate.
    head.renderOrder = 31;
    ring.renderOrder = 30;
    scene.add(marker);
    kit.track(head.geometry); kit.track(head.material);
    kit.track(ring.geometry); kit.track(ring.material);
    pinRef.current = marker;

    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      const view = fitCamera(camera, plan, w, h);
      viewRef.current = view;
      // The pin is sized against the frame rather than the building, so it
      // stays the same few millimetres across on a phone and on a desktop.
      // Scaled per mesh, not on the group, so the ring stays on the floor.
      const s = Math.max(0.6, view.halfH / 10);
      head.scale.setScalar(s);
      ring.scale.setScalar(s);
      head.position.y = 0.5 + 0.45 * s;
      renderer.render(scene, camera);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // Nothing moves on its own here, so there is no animation loop — the scene
    // is redrawn when the pin moves or the frame resizes, and otherwise costs
    // nothing at all.
    let raf = 0;
    const draw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => renderer.render(scene, camera));
    };
    redrawRef.current = draw;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      redrawRef.current = null;
      pinRef.current = null;
      viewRef.current = null;
      kit.dispose();
      renderer.dispose();
      const el = renderer.domElement;
      if (el.parentNode === wrap) wrap.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  // Move the pin in place. Separate from the build so choosing a spot — or
  // nudging it with the arrow keys — never rebuilds the floor.
  useEffect(() => {
    const marker = pinRef.current;
    if (!marker) return;
    if (!pin) marker.visible = false;
    else {
      marker.visible = true;
      marker.position.set(wx(pin.x), 0, wz(pin.y));
      marker.children.forEach((c) => c.material.color.set(color));
    }
    redrawRef.current?.();
  }, [pin && pin.x, pin && pin.y, pin && pin.floor, color, floor]);

  // Screen → floor. Orthographic and overhead, so this is a straight
  // proportion of the frame, then world units back into the blueprint
  // coordinates the router speaks.
  function handleClick(e) {
    const view = viewRef.current;
    const wrap = wrapRef.current;
    if (!view || !wrap || !onPick) return;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    const worldX = view.cx + (u - 0.5) * 2 * view.halfW;
    const worldZ = view.cz + (v - 0.5) * 2 * view.halfH;
    onPick(worldX / S + CX, worldZ / S + CY);
  }

  return <div ref={wrapRef} className={styles.canvas} onClick={handleClick} />;
}
