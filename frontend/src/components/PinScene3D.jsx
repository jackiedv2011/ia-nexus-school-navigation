import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PLANS, createFloorKit, addLights, wx, wz, frameOn, orbitCamera, FOV } from '../lib/floorScene';
import styles from './PinScene3D.module.css';

/* The floor you drop a pin on.

   Deliberately the same scene, the same camera and the same controls as the
   route map (RouteScene3D): a student marking where they are and a student
   reading the route afterwards should be looking at one building, not two
   drawings of it. The only difference is that a tap on this one means
   something.

   A tap is cast onto the floor plane, so it stays exact however the building
   has been turned — and turning it is a drag, which is not a tap. */

export default function PinScene3D({ floor, pin, color, onPick, onFail }) {
  const wrapRef = useRef(null);
  const pinRef = useRef(null);
  // onPick changes identity whenever the parent re-renders; held in a ref so
  // the scene is built once per floor rather than once per render.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

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
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    addLights(THREE, scene);

    const kit = createFloorKit(THREE);
    const { group } = kit.buildFloor(plan);
    scene.add(group);

    // One pin, moved rather than rebuilt: dropping it again must not cost a
    // teardown of the whole floor.
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 22, 16),
      new THREE.MeshBasicMaterial({ color: 0x16a34a, depthTest: false }),
    );
    head.position.y = 1.15;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.15, 40),
      new THREE.MeshBasicMaterial({
        color: 0x16a34a, transparent: true, opacity: 0.8,
        side: THREE.DoubleSide, depthTest: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;          // just clear of the floor slab
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.15, 8),
      new THREE.MeshBasicMaterial({ color: 0x16a34a, depthTest: false }),
    );
    stem.position.y = 0.575;
    const marker = new THREE.Group();
    marker.add(head, ring, stem);
    marker.visible = false;
    // Drawn last and without a depth test: the pin is the one thing that must
    // never end up behind a wall or under a room's name plate.
    head.renderOrder = 32; stem.renderOrder = 31; ring.renderOrder = 30;
    scene.add(marker);
    [head, ring, stem].forEach((m) => { kit.track(m.geometry); kit.track(m.material); });
    pinRef.current = marker;

    // The whole floor, with a small margin — a picker has to show every room
    // there is to point at, and there is no zoom to go looking with.
    const frameFor = (aspect) => frameOn(plan.bbox, { aspect });
    const controls = orbitCamera(THREE, renderer.domElement, camera,
      frameFor(wrap.clientWidth / (wrap.clientHeight || 1)), {
      keys: false,                       // the arrow keys nudge the pin instead
      onTap: (bx, by) => pickRef.current?.(bx, by),
    });

    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      controls.reframe(frameFor(w / h));   // a narrower window must not crop the floor
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
      pinRef.current = null;
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
    if (!pin) { marker.visible = false; return; }
    marker.visible = true;
    marker.position.set(wx(pin.x), 0, wz(pin.y));
    marker.children.forEach((c) => c.material.color.set(color));
  }, [pin && pin.x, pin && pin.y, pin && pin.floor, color, floor]);

  return <div ref={wrapRef} className={styles.canvas} />;
}
