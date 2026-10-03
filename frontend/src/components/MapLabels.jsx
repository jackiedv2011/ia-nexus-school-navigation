import { floorMap } from '../lib/floorMaps';
import MAP_LABELS from '../lib/mapLabels.json';
import styles from './MapLabels.module.css';

// The room numbers and place names of a floor plan, drawn as real text over the
// plan image.
//
// The school's plans had their labels printed into the pixels at about 8 px
// tall, which blurs at any size the app shows them. Those printed labels are
// erased from the served images (scripts/buildMapImages.py) and drawn here
// instead, so they stay sharp at every width and screen density.
//
// Positions are in the plan's own pixel space (FLOOR_MAPS w×h), the same space
// routes and pins use, and are placed as percentages so the layer scales with
// the image. Each label keeps the plan's own size relative to the drawing and
// doesn't shrink below what is readable on a phone, except that it never
// outgrows its room (`fit`, measured off the plan by buildMapImages.py). This
// layer is its own size container so `cqw` is a percentage of the map width.
export default function MapLabels({ floor }) {
  const map = floorMap(floor);
  const labels = MAP_LABELS[floor] || [];
  return (
    <div className={styles.layer} aria-hidden="true">
      {labels.map((l) => (
        <span
          key={l.text}
          className={[
            styles.label,
            l.bold && styles.bold,
            l.kind === 'place' && styles.place,
            l.kind === 'minor' && styles.minor,
            l.narrow && styles[`narrow-${l.narrow}`],
          ].filter(Boolean).join(' ')}
          style={{
            left: `${(l.x / map.w) * 100}%`,
            top: `${(l.y / map.h) * 100}%`,
            '--natural': `${(l.size / map.w) * 100}cqw`,
            ...(l.fit && { '--fit': `${(l.fit / map.w) * 100}cqw` }),
          }}
        >
          {(l.lines || [l.text]).map((line, i) => <span key={i} className={styles.line}>{line}</span>)}
        </span>
      ))}
    </div>
  );
}
