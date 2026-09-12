import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { floorMap, blueprintToImage, imageToBlueprint } from '../lib/floorMaps';
import styles from './PinPicker.module.css';

// three.js is heavy, and the picker only appears once someone chooses "Drop a
// pin", so it is fetched then rather than with the page.
const PinScene3D = lazy(() => import('./PinScene3D'));

// A floor plan you drop a pin on.
//
// The plan is the same 3D model the computed route is drawn on, shown straight
// down, so the two read as one building. The tap→blueprint conversion lives in
// the scene itself: its camera is orthographic and locked overhead, which makes
// screen position a plain proportion of the floor.
//
// A browser without WebGL falls back to the flat scanned plan below, which needs
// the image registration in lib/floorMaps — that transform exists for these plan
// images specifically and is no longer used by anything else.
export default function PinPicker({ floor, value, onChange, color = '#16a34a', label = 'Tap the map to drop a pin' }) {
  const wrapRef = useRef(null);
  const imgRef  = useRef(null);
  const [displayW, setDisplayW] = useState(0);
  const [flat, setFlat] = useState(false);   // no WebGL — use the scanned plan

  const map = floorMap(floor);

  // Track the rendered width so screen↔image conversion uses the real scale.
  // Only the flat fallback needs it; the model measures its own frame.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setDisplayW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = displayW ? displayW / map.w : 1;

  // Clamped to the blueprint so a tap on the very edge still yields a point on
  // the plan rather than just off it.
  const set = useCallback((bx, by) => {
    onChange({
      x: Math.round(Math.min(Math.max(bx, 0), 2448)),
      y: Math.round(Math.min(Math.max(by, 0), 1584)),
      floor,
    });
  }, [floor, onChange]);

  const place = useCallback((clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Screen → image pixels → blueprint.
    const ix = ((clientX - rect.left) / rect.width) * map.w;
    const iy = ((clientY - rect.top) / rect.height) * map.h;
    const [bx, by] = imageToBlueprint([ix, iy], floor);
    set(bx, by);
  }, [floor, map.w, map.h, set]);

  function handleClick(e) {
    if (flat) place(e.clientX, e.clientY);
  }

  // Keyboard: the map is focusable and Enter/Space drops a pin in the middle,
  // which someone can then nudge with the arrow keys. Without this the whole
  // mode is mouse-only.
  function handleKeyDown(e) {
    const step = e.shiftKey ? 40 : 8;   // blueprint px
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!value) onChange({ x: 1224, y: 792, floor });
      return;
    }
    if (!value) return;
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!nudge) return;
    e.preventDefault();
    set(value.x + nudge[0], value.y + nudge[1]);
  }

  // A pin belongs to the floor it was dropped on; showing it over a different
  // floor's plan would place it somewhere meaningless.
  const pin = value && value.floor === floor ? value : null;
  const pinPos = pin && flat ? blueprintToImage([pin.x, pin.y], floor) : null;

  return (
    <div className={styles.root}>
      <div
        ref={wrapRef}
        className={styles.frame}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`${label}. Floor ${floor}.${pin ? ` Pin placed at ${pin.x}, ${pin.y}.` : ' No pin placed yet.'}`}
      >
        {flat ? (
          <img
            ref={imgRef}
            src={map.src}
            alt={`Floor ${floor} plan`}
            className={styles.img}
            draggable={false}
          />
        ) : (
          <Suspense fallback={<div className={styles.loading} aria-hidden="true" />}>
            <PinScene3D
              floor={floor}
              pin={pin}
              color={color}
              onPick={set}
              onFail={() => setFlat(true)}
            />
          </Suspense>
        )}
        {pinPos && (
          <span
            className={styles.pin}
            style={{
              left:  `${pinPos[0] * scale}px`,
              top:   `${pinPos[1] * scale}px`,
              '--pin-color': color,
            }}
          >
            <span className={styles.pinDot} />
            <span className={styles.pinPulse} />
          </span>
        )}
      </div>
      <p className={styles.hint}>
        {pin
          ? <>Pin set on Floor {floor}. Tap again to move it, or use the arrow keys.</>
          : <>{label}</>}
      </p>
    </div>
  );
}
