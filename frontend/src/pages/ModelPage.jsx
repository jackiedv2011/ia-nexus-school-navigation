import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FloorModel3D from '../components/FloorModel3D';
import styles from './ModelPage.module.css';

/* A 3D view of the building, one floor at a time. Clicking a room sends you to
   the Route Finder with it already chosen as the destination — the model is a
   way into navigation, not a separate toy. */

const FLOORS = [1, 2, 3];

export default function ModelPage() {
  const [floor, setFloor] = useState(3);
  const navigate = useNavigate();

  const goToRoute = (room, onFloor) => {
    navigate(`/route?to=${encodeURIComponent(room)}&toFloor=${onFloor}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.navbar}>
        <Link to="/" className={styles.navLogo}>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.navLogoImg} />
          <span className={styles.navLogoText}>IA Nexus</span>
        </Link>
        <nav className={styles.navLinks}>
          <Link to="/" className={styles.navLink}>Chat</Link>
          <Link to="/route" className={styles.navLink}>Route Finder</Link>
          <Link to="/model" className={`${styles.navLink} ${styles.navLinkActive}`}>3D Model</Link>
          <Link to="/schedule" className={styles.navLink}>My Schedule</Link>
          <Link to="/teachers" className={styles.navLink}>Teachers</Link>
        </nav>
      </header>

      <main className={styles.content}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>The building</p>
            <h1 className={styles.title}>Floor {floor} in 3D</h1>
            <p className={styles.lede}>
              Drag to turn the floor, scroll to zoom, right-drag to pan. Hover a
              room for its size, or click one to route there.
            </p>
          </div>

          <div className={styles.floorTabs} role="tablist" aria-label="Floor">
            {FLOORS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={f === floor}
                className={`${styles.floorTab} ${f === floor ? styles.floorTabActive : ''}`}
                onClick={() => setFloor(f)}
              >
                Floor {f}
              </button>
            ))}
          </div>
        </div>

        <FloorModel3D floor={floor} onSelect={goToRoute} />

        <ul className={styles.key}>
          <li><i style={{ background: '#c9d8e8' }} />Room</li>
          <li><i style={{ background: '#bfd8c6' }} />Xchange / Library</li>
          <li><i style={{ background: '#e8d5b7' }} />Stairwell</li>
          <li><i style={{ background: '#8d9aa6' }} />Hallway</li>
          <li><i style={{ background: '#e0a253' }} />Doorway</li>
        </ul>

        <p className={styles.note}>
          Built from the same corridors, doorways and stair landings the Route
          Finder walks. The plans record where doors are, not where walls run, so
          room positions and the hallway each opens onto are exact while
          wall-to-wall sizes are approximate.
        </p>
      </main>
    </div>
  );
}
