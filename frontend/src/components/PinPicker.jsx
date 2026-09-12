import { useEffect, useRef, useState, useCallback } from 'react';
import { floorMap, blueprintToImage, imageToBlueprint } from '../lib/floorMaps';
import styles from './PinPicker.module.css';

// A floor plan you drop a pin on.
//
// The plan is drawn at whatever width the layout gives it, so every coordinate
// crosses three spaces: the blueprint space the router speaks, this plan
// image's own pixels, and the on-screen pixels after CSS scaling. The transform
// lives in lib/floorMaps because it belongs to these plan images specifically —
// the computed route is now drawn on the 3D model instead, which works straight
// in blueprint space. The display scale is measured from the rendered element
// rather than assumed, so it stays right at any width and after a resize.
export default function PinPicker({ floor, value, onChange, color = '#16a34a', label = 'Tap the map to drop a pin' }) {
  const wrapRef = useRef(null);
  const imgRef  = useRef(null);
  const [displayW, setDisplayW] = useState(0);

  const map = floorMap(floor);

  // Track the rendered width so screen↔image conversion uses the real scale.
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

  const place = useCallback((clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Screen → image pixels → blueprint. Clamped to the drawing so a tap on the
    // very edge still yields a point on the plan rather than just off it.
    const ix = ((clientX - rect.left) / rect.width) * map.w;
    const iy = ((clientY - rect.top) / rect.height) * map.h;
    const [bx, by] = imageToBlueprint([ix, iy], floor);
    onChange({
      x: Math.round(Math.min(Math.max(bx, 0), 2448)),
      y: Math.round(Math.min(Math.max(by, 0), 1584)),
      floor,
    });
  }, [floor, map.w, map.h, onChange]);

  function handleClick(e) {
    place(e.clientX, e.clientY);
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
    onChange({
      x: Math.round(Math.min(Math.max(value.x + nudge[0], 0), 2448)),
      y: Math.round(Math.min(Math.max(value.y + nudge[1], 0), 1584)),
      floor,
    });
  }

  // A pin belongs to the floor it was dropped on; showing it over a different
  // floor's plan would place it somewhere meaningless.
  const pin = value && value.floor === floor ? value : null;
  const pinPos = pin ? blueprintToImage([pin.x, pin.y], floor) : null;

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
        <img
          ref={imgRef}
          src={map.src}
          alt={`Floor ${floor} plan`}
          className={styles.img}
          draggable={false}
        />
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
