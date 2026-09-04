import { useEffect, useRef } from 'react';
import styles from './NavigationMap.module.css';

const FLOOR_LABELS = { 1: 'Floor 1', 2: 'Floor 2', 3: 'Floor 3' };

// ─── Floor plan images + blueprint→image transform ────────────────────────────
// Every route coordinate the backend produces (rooms, corridors, stairwells) is
// expressed in the ORIGINAL annotated blueprint's 2448×1584 pixel space. The
// floor plans the school issued are a redrawn, simplified version of those same
// blueprints at a different scale and crop — same building, same wall positions,
// different image.
//
// Rather than re-deriving hundreds of room coordinates against the new drawings
// (and re-validating the pathfinder against them), each floor carries the
// similarity transform that maps blueprint space onto its image:
//
//     imageX = blueprintX * scale + dx
//     imageY = blueprintY * scale + dy
//
// The numbers come from FFT cross-correlation registration of the new drawing
// against the blueprint it replaced (uniform scale + translation, ink-mask
// correlation), verified by overlaying the two and confirming the walls land on
// each other. Because the transform lives here at draw time, roomCoordinates.js
// and the routing algorithm are untouched — swapping in another revision of the
// plans only means re-running the registration and updating these six numbers.
const FLOOR_MAPS = {
  1: { src: '/maps/floor1.png', w: 1222, h: 681, scale: 0.50118, dx:   -3.5, dy:  -8.7 },
  2: { src: '/maps/floor2.png', w:  873, h: 653, scale: 0.41653, dx:  -76.1, dy:  -1.2 },
  3: { src: '/maps/floor3.png', w:  982, h: 762, scale: 0.49983, dx: -130.5, dy: -11.2 },
};

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
    ctx.setLineDash([10 * scale, 6 * scale]);
    ctx.lineWidth   = 4 * scale;
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
    const aLen  = 14 * scale;
    ctx.save();
    ctx.fillStyle = '#B0252A';
    ctx.beginPath();
    ctx.moveTo(last[0], last[1]);
    ctx.lineTo(last[0] - aLen * Math.cos(angle - 0.4), last[1] - aLen * Math.sin(angle - 0.4));
    ctx.lineTo(last[0] - aLen * Math.cos(angle + 0.4), last[1] - aLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Markers
    const markerColors = ['#16a34a', '#dc2626']; // green = start, red = end
    const markerLabels = labels;
    [scaled[0], scaled[scaled.length - 1]].forEach(([x, y], idx) => {
      const r = 9 * scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle   = markerColors[idx];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2.5 * scale;
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Label bubble
      const label = markerLabels[idx] || '';
      if (label) {
        ctx.save();
        ctx.font         = `bold ${Math.max(11, 11 * scale)}px Inter, sans-serif`;
        const tw         = ctx.measureText(label).width;
        const pad        = 6 * scale;
        const bx         = x + r + 4 * scale;
        const by         = y - 10 * scale;
        const bw         = tw + pad * 2;
        const bh         = 20 * scale;
        const br         = 4 * scale;
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
        ctx.fillText(label, bx + pad, by + bh - 6 * scale);
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
      canvas.width   = displayW * window.devicePixelRatio;
      canvas.height  = Math.round((displayW * MAP_H / MAP_W)) * window.devicePixelRatio;
      canvas.style.width  = displayW + 'px';
      canvas.style.height = Math.round(displayW * MAP_H / MAP_W) + 'px';

      const img = imgRef.current;
      if (img && img.complete) draw();
    }

    setup();

    // Re-size and re-draw on viewport changes (resize / orientation) so the
    // overlaid path stays aligned with the responsive map image (H3).
    function onResize() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(setup);
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, containerW]);

  return (
    <div className={styles.mapFrame}>
      <img
        ref={imgRef}
        src={map.src}
        alt={`Floor ${floor} map`}
        className={styles.mapImg}
        decoding="async"
        onLoad={draw}
      />
      <canvas ref={canvasRef} className={styles.mapCanvas} />
    </div>
  );
}

export default function NavigationMap({ data }) {
  if (!data) return null;
  const { fromFloor, toFloor, sameFloor, path1, path2, stairNum, fromLabel, toLabel } = data;

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
