import { useState, useRef, useCallback, useEffect } from 'react';
import { Building2, Drama, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import styles from './MapPanel.module.css';

const FLOORS = [
  { key: 'floor1',      label: 'Floor 1',     Icon: Building2, desc: 'Admin, Labs, Engineering' },
  { key: 'floor2',      label: 'Floor 2',     Icon: Building2, desc: 'Health Sciences, CS Labs' },
  { key: 'floor3',      label: 'Floor 3',     Icon: Building2, desc: 'Science Labs, Classrooms' },
  { key: 'auditorium',  label: 'Auditorium',  Icon: Drama,     desc: 'Theater & Event Space' },
];

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.4;

export default function MapPanel({ open, onClose }) {
  const [active, setActive] = useState('floor1');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false); // drives the cursor (L6)
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pinchRef = useRef(null); // { dist, zoom } baseline for two-finger zoom
  const wrapRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const clampPan = useCallback((x, y, z) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x, y };
    const maxX = (wrap.clientWidth  * (z - 1)) / 2;
    const maxY = (wrap.clientHeight * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const applyWheelZoom = useCallback((deltaY) => {
    setZoom(prev => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev - deltaY * 0.005));
      setPan(p => clampPan(p.x, p.y, next));
      return next;
    });
  }, [clampPan]);

  // React attaches wheel listeners PASSIVELY at the root, so preventDefault()
  // inside an onWheel prop is a no-op (and logs a console warning) — the page
  // scrolled behind the map while the user was trying to zoom it. A native
  // listener registered with { passive: false } is the only way to stop that.
  useEffect(() => {
    const el = wrapRef.current;
    if (!open || !el) return;
    function onWheel(e) {
      e.preventDefault();
      applyWheelZoom(e.deltaY);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, applyWheelZoom]);

  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return;
    dragging.current = true;
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, [zoom]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan(p => clampPan(p.x + dx, p.y + dy, zoom));
  }, [zoom, clampPan]);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
  }, []);

  // ── Touch: one-finger pan, two-finger pinch-zoom (H4) ──
  const touchDist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: touchDist(e.touches), zoom };
    } else if (e.touches.length === 1 && zoom > 1) {
      dragging.current = true;
      setIsDragging(true);
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = touchDist(e.touches) / pinchRef.current.dist;
      setZoom(() => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.zoom * ratio));
        setPan(p => clampPan(p.x, p.y, next));
        return next;
      });
    } else if (e.touches.length === 1 && dragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setPan(p => clampPan(p.x + dx, p.y + dy, zoom));
    }
  }, [zoom, clampPan]);

  const handleTouchEnd = useCallback((e) => {
    if (!e.touches || e.touches.length === 0) {
      dragging.current = false;
      setIsDragging(false);
      pinchRef.current = null;
    }
  }, []);

  const changeZoom = (delta) => {
    setZoom(prev => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
      setPan(p => clampPan(p.x, p.y, next));
      return next;
    });
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const switchFloor = (key) => { setActive(key); setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!open) return null;

  const cursor = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default';

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Floor Maps</h2>
          <p className={styles.sub}>School Blueprint</p>
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Close map"><X size={18} strokeWidth={2} /></button>
      </div>

      {/* Tab strip */}
      <div className={styles.tabs}>
        {FLOORS.map(f => (
          <button
            key={f.key}
            className={`${styles.tab} ${active === f.key ? styles.tabActive : ''}`}
            onClick={() => switchFloor(f.key)}
          >
            <span className={styles.tabIcon}><f.Icon size={18} strokeWidth={2} /></span>
            <span className={styles.tabLabel}>{f.label}</span>
          </button>
        ))}
      </div>

      {/* Map image */}
      <div
        ref={wrapRef}
        className={styles.mapWrap}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ overflow: 'hidden', userSelect: 'none', touchAction: 'none' }}
      >
        <img
          key={active}
          src={`/maps/${active}.png`}
          alt={`${active} floor plan`}
          className={styles.mapImg}
          draggable={false}
          decoding="async"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging.current ? 'none' : 'transform 0.15s ease',
            cursor,
            willChange: 'transform',
          }}
        />

        {/* Zoom controls. onMouseDown is stopped here so clicking a button at
            zoom > 1 doesn't also begin a pan drag on the map behind it. */}
        <div className={styles.zoomControls} onMouseDown={e => e.stopPropagation()}>
          <button className={styles.zoomBtn} onClick={() => changeZoom(ZOOM_STEP)} title="Zoom in" disabled={zoom >= MAX_ZOOM}><ZoomIn size={17} strokeWidth={2} /></button>
          <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
          <button className={styles.zoomBtn} onClick={() => changeZoom(-ZOOM_STEP)} title="Zoom out" disabled={zoom <= MIN_ZOOM}><ZoomOut size={17} strokeWidth={2} /></button>
          {zoom !== 1 && <button className={styles.zoomBtn} onClick={resetView} title="Reset view"><RotateCcw size={16} strokeWidth={2} /></button>}
        </div>
      </div>

      {/* Floor description */}
      <div className={styles.desc}>
        <span className={styles.descIcon}>
          {(() => { const F = FLOORS.find(f => f.key === active)?.Icon; return F ? <F size={20} strokeWidth={2} /> : null; })()}
        </span>
        <div>
          <p className={styles.descTitle}>{FLOORS.find(f => f.key === active)?.label}</p>
          <p className={styles.descSub}>{FLOORS.find(f => f.key === active)?.desc}</p>
        </div>
      </div>
    </aside>
  );
}
