import { useEffect, useRef } from 'react';
import styles from './NavigationMap.module.css';
import { FLOOR_MAPS } from '../lib/floorMaps';
import MapLabels from './MapLabels';
import MAP_LABELS from '../lib/mapLabels.json';

const FLOOR_LABELS = { 1: 'Floor 1', 2: 'Floor 2', 3: 'Floor 3' };

// The floor plans and the blueprint→image transform live in lib/floorMaps.js:
// the pin picker needs the exact same numbers to turn a tap back into a
// blueprint coordinate, and the two must never drift apart.

// Draw path + markers on a canvas that sits on top of a floor-map image
// `points` is already a pre-computed hallway-following waypoint array — draw it directly.
function MapCanvas({ floor, points, labels, containerW }) {
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);
  const map   = FLOOR_MAPS[floor] || FLOOR_MAPS[1];
  const MAP_W = map.w;
  const MAP_H = map.h;

  function draw() {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !img.complete) return;

    const scale = canvas.width / MAP_W;
    // Sizes are in plan pixels (× scale), with a floor in screen pixels (× dpr)
    // so the route, markers and their labels stay legible on a phone, where
    // the whole plan is shrunk to a third of its size.
    const dpr   = window.devicePixelRatio || 1;
    const size  = (planPx, minCssPx) => Math.max(planPx * scale, minCssPx * dpr);
    const ctx   = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Blueprint space → this floor plan's pixels → canvas pixels.
    const scaled = points.map(([x, y]) => [
      (x * map.scale + map.dx) * scale,
      (y * map.scale + map.dy) * scale,
    ]);

    if (scaled.length < 2) return;

    // Dashed path line
    ctx.save();
    ctx.setLineDash([size(9, 6), size(5, 3.5)]);
    ctx.lineWidth   = size(3.5, 2.5);
    ctx.strokeStyle = '#B0252A';
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(scaled[0][0], scaled[0][1]);
    for (let i = 1; i < scaled.length; i++) ctx.lineTo(scaled[i][0], scaled[i][1]);
    ctx.stroke();
    ctx.restore();

    // Arrowhead at final segment
    const last  = scaled[scaled.length - 1];
    const prev  = scaled[scaled.length - 2];
    const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    const aLen  = size(12, 9);
    ctx.save();
    ctx.fillStyle = '#B0252A';
    ctx.beginPath();
    ctx.moveTo(last[0], last[1]);
    ctx.lineTo(last[0] - aLen * Math.cos(angle - 0.4), last[1] - aLen * Math.sin(angle - 0.4));
    ctx.lineTo(last[0] - aLen * Math.cos(angle + 0.4), last[1] - aLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Roughly where each room label sits on the canvas, so a marker's bubble
    // can be put where it hides the fewest of them — above all, not on the
    // number of the room it is pointing at.
    const labelBoxes = (MAP_LABELS[floor] || []).map((l) => {
      // Mirrors MapLabels: plan size, a readable floor, never bigger than the room.
      const fs = Math.min(size(l.size, 10), l.fit ? l.fit * scale : Infinity);
      const lines = l.lines || [l.text];
      const w = Math.max(...lines.map((t) => t.length)) * fs * 0.6;
      const h = lines.length * fs * 1.15;
      const cx = l.x * scale, cy = l.y * scale;
      return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    });
    const hidden = ([x1, y1, x2, y2]) => labelBoxes.reduce((sum, [a1, b1, a2, b2]) =>
      sum + Math.max(0, Math.min(x2, a2) - Math.max(x1, a1)) * Math.max(0, Math.min(y2, b2) - Math.max(y1, b1)), 0);

    // Markers
    const markerColors = ['#16a34a', '#dc2626']; // green = start, red = end
    const markerLabels = labels;
    [scaled[0], scaled[scaled.length - 1]].forEach(([x, y], idx) => {
      const r = size(7, 5);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle   = markerColors[idx];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = size(2, 1.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Label bubble
      const label = markerLabels[idx] || '';
      if (label) {
        ctx.save();
        const fs         = size(9, 8);
        ctx.font         = `bold ${fs}px Inter, sans-serif`;
        const tw         = ctx.measureText(label).width;
        const pad        = fs * 0.42;
        const bw         = tw + pad * 2;
        const bh         = fs * 1.5;
        const br         = fs * 0.36;
        const gap        = r + fs * 0.3;
        // Right, left, above or below the marker: whichever fits on the plan
        // and covers the least label text (ties go to the right).
        const clampX = (v) => Math.min(Math.max(v, 0), canvas.width - bw);
        const clampY = (v) => Math.min(Math.max(v, 0), canvas.height - bh);
        const spots = [
          [x + gap, y - bh / 2],
          [x - gap - bw, y - bh / 2],
          [x - bw / 2, y - gap - bh],
          [x - bw / 2, y + gap],
        ].map(([px, py]) => [clampX(px), clampY(py)]);
        // Clamping can push a bubble back over its own marker; that spot loses.
        const onMarker = ([px, py]) => px < x + r && px + bw > x - r && py < y + r && py + bh > y - r;
        const cost = (p) => hidden([p[0], p[1], p[0] + bw, p[1] + bh]) + (onMarker(p) ? 1e9 : 0);
        const [bx, by]   = spots.reduce((best, p) => (cost(p) < cost(best) ? p : best));
        // Rounded rect
        ctx.fillStyle = markerColors[idx];
        ctx.beginPath();
        ctx.moveTo(bx + br, by);
        ctx.lineTo(bx + bw - br, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + br, br);
        ctx.lineTo(bx + bw, by + bh - br);
        ctx.arcTo(bx + bw, by + bh, bx + bw - br, by + bh, br);
        ctx.lineTo(bx + br, by + bh);
        ctx.arcTo(bx, by + bh, bx, by + bh - br, br);
        ctx.lineTo(bx, by + br);
        ctx.arcTo(bx, by, bx + br, by, br);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + pad, by + bh / 2);
        ctx.restore();
      }
    });

  }

  useEffect(() => {
    let raf = 0;

    function setup() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const displayW = containerW || canvas.parentElement?.clientWidth || 600;
      const displayH = displayW * MAP_H / MAP_W;
      canvas.width   = Math.round(displayW * window.devicePixelRatio);
      canvas.height  = Math.round(displayH * window.devicePixelRatio);
      canvas.style.width  = displayW + 'px';
      canvas.style.height = displayH + 'px';

      const img = imgRef.current;
      if (img && img.complete) draw();
    }

    setup();

    // Re-size and re-draw whenever the map's frame changes size (viewport
    // resize, orientation, layout) so the overlaid path stays aligned with the
    // responsive map image (H3).
    function onResize() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(setup);
    }
    const frame = canvasRef.current?.parentElement;
    let ro = null;
    if (frame && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(frame);
    } else {
      window.addEventListener('resize', onResize);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, containerW]);

  return (
    <div className={styles.mapFrame} style={{ '--aspect': MAP_W / MAP_H }}>
      <img
        ref={imgRef}
        src={map.src}
        alt={`Floor ${floor} map`}
        className={styles.mapImg}
        decoding="async"
        onLoad={draw}
      />
      <MapLabels floor={floor} />
      <canvas ref={canvasRef} className={styles.mapCanvas} />
    </div>
  );
}

export default function NavigationMap({ data }) {
  if (!data) return null;
  const { fromFloor, toFloor, sameFloor, path1, path2, stairNum, fromLabel, toLabel } = data;

  // A path needs at least two points to be drawn. Callers now treat an
  // undrawable route as an error, but this is the last line of defence: without
  // it the component rendered a floor plan with nothing on it and no
  // explanation, which reads as "the route is right there, somewhere".
  const drawable = (p) => Array.isArray(p) && p.length >= 2;
  if (!drawable(path1) || (!sameFloor && !drawable(path2))) {
    return (
      <div className={styles.root}>
        <p className={styles.emptyState} role="alert">
          No walkable route could be drawn between these two locations.
        </p>
      </div>
    );
  }

  // Plain-text description of the route for screen readers, since the route
  // itself is drawn on a <canvas> that assistive tech cannot interpret (H3).
  const textAlternative = sameFloor
    ? `Route on Floor ${fromFloor} from ${fromLabel || 'start'} to ${toLabel || 'destination'}. Both locations are on the same floor, so no stairs are needed.`
    : `Route from ${fromLabel || 'start'} on Floor ${fromFloor} to ${toLabel || 'destination'} on Floor ${toFloor}. Walk to Stairwell ${stairNum}, change floors, then continue to the destination.`;

  if (sameFloor) {
    return (
      <div className={styles.root} role="img" aria-label={textAlternative}>
        <p className={styles.srOnly}>{textAlternative}</p>
        <div className={styles.panelHeader}>
          <span className={styles.floorBadge}>Floor {fromFloor}</span>
          <span className={styles.panelTitle}>Your Route</span>
        </div>
        <MapCanvas
          floor={fromFloor}
          points={path1 || []}
          labels={['Start', 'Destination']}
        />
      </div>
    );
  }

  return (
    <div className={styles.root} role="img" aria-label={textAlternative}>
      <p className={styles.srOnly}>{textAlternative}</p>
      {/* From-floor panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.floorBadge}>Floor {fromFloor}</span>
          <span className={styles.panelTitle}>Walk to the Stairwell</span>
        </div>
        <MapCanvas
          floor={fromFloor}
          points={path1 || []}
          labels={['You are here', `Stairwell ${stairNum}`]}
        />
      </div>

      <div className={styles.divider}>
        <span className={styles.dividerIcon}>▲ Take Stairwell {stairNum} ▲</span>
      </div>

      {/* To-floor panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.floorBadge}>Floor {toFloor}</span>
          <span className={styles.panelTitle}>Walk to Destination</span>
        </div>
        <MapCanvas
          floor={toFloor}
          points={path2 || []}
          labels={[`Stairwell ${stairNum} exit`, 'Destination']}
        />
      </div>
    </div>
  );
}
