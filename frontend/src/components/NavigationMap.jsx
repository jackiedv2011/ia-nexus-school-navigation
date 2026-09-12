import { lazy, Suspense } from 'react';
import styles from './NavigationMap.module.css';

/* The map a student reads after finding a route.

   The floor is drawn as a 3D model rather than the scanned blueprint: same
   corridors, doorways and stair landings the router walks (see
   lib/floorScene.js), with the computed path laid over them. The panel
   structure around it is unchanged — one map per floor, and a cross-floor trip
   still reads as "walk to the stairwell, change floors, carry on".

   three.js is loaded on demand: a student who never looks up a route never
   pays for it. */
const RouteScene3D = lazy(() => import('./RouteScene3D'));

function MapFrame(props) {
  return (
    <Suspense fallback={<div className={styles.mapPlaceholder} aria-hidden="true" />}>
      <RouteScene3D {...props} />
    </Suspense>
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
        <MapFrame
          floor={fromFloor}
          points={path1 || []}
          labels={['Start', 'Destination']}
          caption={textAlternative}
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
        <MapFrame
          floor={fromFloor}
          points={path1 || []}
          labels={['You are here', `Stairwell ${stairNum}`]}
          caption={`Floor ${fromFloor}: walk from ${fromLabel || 'your start'} to Stairwell ${stairNum}.`}
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
        <MapFrame
          floor={toFloor}
          points={path2 || []}
          labels={[`Stairwell ${stairNum} exit`, 'Destination']}
          caption={`Floor ${toFloor}: walk from Stairwell ${stairNum} to ${toLabel || 'your destination'}.`}
        />
      </div>
    </div>
  );
}
