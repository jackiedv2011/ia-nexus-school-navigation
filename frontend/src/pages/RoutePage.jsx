import { useState, useRef, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpDown, ArrowRight, Star, Clock, Map, MapPin, Flag,
  Footprints, Ruler, MoveVertical,
} from 'lucide-react';
import NavigationMap from '../components/NavigationMap';
import { api } from '../api';
import styles from './RoutePage.module.css';

// ─── Room lists per floor ─────────────────────────────────────────────────────

const ROOMS = {
  1: [101,102,103,104,116,121,122,123,124,135,136,137,138,139,141,142,144,145,
      146,147,151,152,153,155,157,158,161,164,172,173,174,180,181,183,184,185,
      186,187,188,189,191,192],
  2: [210,223,224,231,233,235,236,242,244,245,246,247,249,251,252,253,258,261,
      262,263,264,265,267,268,272,273,274,275,277,281,282,283,284,291,292,293,294],
  3: [301,322,324,331,332,333,334,336,342,345,346,349,351,354,356,359,362,363,
      364,367,372,373,375,377,379,381,382,383,384,391,392,393,394],
};

// ─── Floor-tabbed room selector ───────────────────────────────────────────────

function FloorRoomSelector({ label, dotColor, selectedFloor, selectedRoom, onFloorChange, onRoomChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1); // keyboard-highlighted option (M4)
  const wrapRef = useRef(null);
  const listId = useId();

  const rooms = ROOMS[selectedFloor] || [];
  const filtered = rooms.filter(n =>
    !query.trim() || String(n).includes(query.trim())
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keep the highlight within the filtered list as it changes
  useEffect(() => { setHighlight(-1); }, [query, selectedFloor]);

  function selectRoom(roomNum) {
    onRoomChange(String(roomNum));
    setQuery(`Room ${roomNum}`);
    setOpen(false);
    setHighlight(-1);
  }

  function handleFloorTab(floor) {
    onFloorChange(floor);
    onRoomChange('');
    setQuery('');
  }

  function handleInput(e) {
    setQuery(e.target.value);
    onRoomChange('');
    setOpen(true);
  }

  // Arrow-key / Enter / Escape support for the listbox (M4)
  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0 && highlight < filtered.length) {
        e.preventDefault();
        selectRoom(filtered[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  }

  // Sync display when room is cleared externally (swap)
  useEffect(() => {
    setQuery(selectedRoom ? `Room ${selectedRoom}` : '');
  }, [selectedRoom]);

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        <span className={styles.labelDot} style={{ background: dotColor }} />
        {label}
      </label>

      {/* Floor tabs */}
      <div className={styles.floorTabs}>
        {[1, 2, 3].map(floor => (
          <button
            key={floor}
            type="button"
            className={`${styles.floorTab} ${selectedFloor === floor ? styles.floorTabActive : ''}`}
            onClick={() => handleFloorTab(floor)}
          >
            Floor {floor}
          </button>
        ))}
      </div>

      {/* Searchable room list */}
      <div className={styles.selectWrap} ref={wrapRef}>
        <input
          className={styles.selectInput}
          type="text"
          placeholder={`Search Floor ${selectedFloor} rooms…`}
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={`${label} — search rooms`}
          aria-activedescendant={highlight >= 0 ? `${listId}-opt-${filtered[highlight]}` : undefined}
        />
        <span className={styles.selectChevron}>▾</span>
        {open && filtered.length > 0 && (
          <ul className={styles.dropdown} id={listId} role="listbox" aria-label={`Floor ${selectedFloor} rooms`}>
            {filtered.map((n, i) => (
              <li
                key={n}
                id={`${listId}-opt-${n}`}
                role="option"
                aria-selected={String(n) === selectedRoom}
                className={`${styles.dropdownItem} ${String(n) === selectedRoom ? styles.dropdownItemActive : ''} ${i === highlight ? styles.dropdownItemActive : ''}`}
                onMouseDown={() => selectRoom(n)}
                onMouseEnter={() => setHighlight(i)}
              >
                Room {n}
              </li>
            ))}
          </ul>
        )}
        {open && filtered.length === 0 && (
          <div className={styles.dropdownEmpty}>
            No rooms match &ldquo;{query}&rdquo; on Floor {selectedFloor}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Walking-time estimate ────────────────────────────────────────────────────
// Purely a display calculation derived from the already-computed route path.
// Does NOT affect how the route is found — it just measures the drawn path.
const MAP_W = 2448;                  // floor-plan image width in px
const METERS_PER_MAP_WIDTH = 140;    // approx real-world width the plan spans
const M_PER_PX = METERS_PER_MAP_WIDTH / MAP_W;
const WALK_SPEED_MPS = 1.3;          // average indoor walking speed
const STAIR_SECONDS = 25;            // added per floor changed

function pathLengthPx(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    total += Math.hypot(dx, dy);
  }
  return total;
}

function estimateWalk(data) {
  const px = pathLengthPx(data.path1) + pathLengthPx(data.path2);
  const meters = px * M_PER_PX;
  const floorChanges = data.sameFloor
    ? 0
    : Math.abs((data.toFloor || 0) - (data.fromFloor || 0));
  const seconds = meters / WALK_SPEED_MPS + floorChanges * STAIR_SECONDS;
  return { minutes: Math.max(1, Math.round(seconds / 60)), meters: Math.round(meters) };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RoutePage() {
  const [fromFloor, setFromFloor] = useState(1);
  const [fromKey,   setFromKey]   = useState('');
  const [toFloor,   setToFloor]   = useState(1);
  const [toKey,     setToKey]     = useState('');
  const [routeData, setRouteData] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [recents,   setRecents]   = useState([]);
  const [saved,     setSaved]     = useState([]);
  const mapRef = useRef(null);

  // Load saved + recent routes (localStorage only — no effect on pathfinding)
  useEffect(() => {
    try {
      setRecents(JSON.parse(localStorage.getItem('ia_recent_routes') || '[]'));
      setSaved(JSON.parse(localStorage.getItem('ia_saved_routes') || '[]'));
    } catch { /* ignore corrupt storage */ }
  }, []);

  const keyOf = r => `${r.fromFloor}:${r.fromKey}->${r.toFloor}:${r.toKey}`;

  function addRecent(entry) {
    setRecents(prev => {
      const next = [entry, ...prev.filter(r => keyOf(r) !== keyOf(entry))].slice(0, 6);
      localStorage.setItem('ia_recent_routes', JSON.stringify(next));
      return next;
    });
  }

  function toggleSaved(entry) {
    setSaved(prev => {
      const exists = prev.some(r => keyOf(r) === keyOf(entry));
      const next = exists
        ? prev.filter(r => keyOf(r) !== keyOf(entry))
        : [entry, ...prev].slice(0, 12);
      localStorage.setItem('ia_saved_routes', JSON.stringify(next));
      return next;
    });
  }

  function removeSaved(entry) {
    setSaved(prev => {
      const next = prev.filter(r => keyOf(r) !== keyOf(entry));
      localStorage.setItem('ia_saved_routes', JSON.stringify(next));
      return next;
    });
  }

  const currentEntry = fromKey && toKey ? { fromFloor, fromKey, toFloor, toKey } : null;
  const currentSaved = currentEntry && saved.some(r => keyOf(r) === keyOf(currentEntry));

  async function findRouteWith(fFloor, fKey, tFloor, tKey) {
    setError('');
    setLoading(true);
    setRouteData(null);
    try {
      const data = await api.findRoute({ fromRoom: fKey, fromFloor: fFloor, toRoom: tKey, toFloor: tFloor });
      setRouteData(data);
      addRecent({ fromFloor: fFloor, fromKey: fKey, toFloor: tFloor, toKey: tKey });
      setTimeout(() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.message || 'Unable to connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFindRoute(e) {
    e.preventDefault();
    if (!fromKey || !toKey) {
      setError('Please select both a starting location and a destination.');
      return;
    }
    if (fromKey === toKey && fromFloor === toFloor) {
      setError('Starting location and destination cannot be the same.');
      return;
    }
    await findRouteWith(fromFloor, fromKey, toFloor, toKey);
  }

  function runQuickRoute(r) {
    setFromFloor(r.fromFloor);
    setFromKey(r.fromKey);
    setToFloor(r.toFloor);
    setToKey(r.toKey);
    findRouteWith(r.fromFloor, r.fromKey, r.toFloor, r.toKey);
  }

  function handleSwap() {
    const tempFloor = fromFloor, tempKey = fromKey;
    setFromFloor(toFloor);
    setFromKey(toKey);
    setToFloor(tempFloor);
    setToKey(tempKey);
    setRouteData(null);
  }

  return (
    <div className={styles.page}>
      {/* ── Navbar ── */}
      <header className={styles.navbar}>
        <Link to="/app" className={styles.navLogo}>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.navLogoImg} />
          <span className={styles.navLogoText}>IA Nexus</span>
        </Link>
        <nav className={styles.navLinks}>
          <Link to="/app" className={styles.navLink}>Chat</Link>
          <Link to="/route" className={`${styles.navLink} ${styles.navLinkActive}`}>Route Finder</Link>
          <Link to="/schedule" className={styles.navLink}>My Schedule</Link>
          <Link to="/teachers" className={styles.navLink}>Teachers</Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>Navigation</p>
        <h1 className={styles.heroTitle}>Find Your Route</h1>
        <p className={styles.heroSub}>Select any two locations to get step-by-step directions on the floor map.</p>
      </section>

      {/* ── Search card ── */}
      <main className={styles.content}>
        <form className={styles.card} onSubmit={handleFindRoute}>
          <div className={styles.fields}>
            <FloorRoomSelector
              label="Starting Location"
              dotColor="#16a34a"
              selectedFloor={fromFloor}
              selectedRoom={fromKey}
              onFloorChange={setFromFloor}
              onRoomChange={setFromKey}
            />

            <button type="button" className={styles.swapBtn} onClick={handleSwap} title="Swap">
              <ArrowUpDown size={18} strokeWidth={2} />
            </button>

            <FloorRoomSelector
              label="Destination"
              dotColor="#dc2626"
              selectedFloor={toFloor}
              selectedRoom={toKey}
              onFloorChange={setToFloor}
              onRoomChange={setToKey}
            />
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button
            type="submit"
            className={styles.findBtn}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              <>
                <span className={styles.findBtnIcon}><ArrowRight size={18} strokeWidth={2.2} /></span>
                Find Route
              </>
            )}
          </button>
        </form>

        {/* ── Saved + recent quick routes ── */}
        {(saved.length > 0 || recents.length > 0) && (
          <div className={styles.quickRoutes}>
            {saved.length > 0 && (
              <div className={styles.quickGroup}>
                <p className={styles.quickLabel}><Star size={13} strokeWidth={2} fill="currentColor" /> Saved</p>
                <div className={styles.chipRow}>
                  {saved.map(r => (
                    <div key={keyOf(r)} className={styles.chip}>
                      <button className={styles.chipMain} onClick={() => runQuickRoute(r)}>
                        {r.fromKey} → {r.toKey}
                      </button>
                      <button className={styles.chipX} onClick={() => removeSaved(r)} title="Remove">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recents.length > 0 && (
              <div className={styles.quickGroup}>
                <p className={styles.quickLabel}><Clock size={13} strokeWidth={2} /> Recent</p>
                <div className={styles.chipRow}>
                  {recents.map(r => (
                    <div key={keyOf(r)} className={styles.chip}>
                      <button className={styles.chipMain} onClick={() => runQuickRoute(r)}>
                        {r.fromKey} → {r.toKey}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Map result ── */}
        {routeData && (
          <div className={styles.mapCard} ref={mapRef}>
            <div className={styles.mapCardHeader}>
              <div className={styles.mapCardHeaderLeft}>
                <span className={styles.mapCardIcon}><Map size={20} strokeWidth={2} /></span>
                <div>
                  <p className={styles.mapCardTitle}>Route Found</p>
                  <p className={styles.mapCardSub}>
                    {routeData.sameFloor
                      ? `Both locations are on Floor ${routeData.fromFloor}`
                      : `Floors ${routeData.fromFloor} → ${routeData.toFloor} — use the stairwell`}
                  </p>
                  <p className={styles.mapCardSummary}>
                    <MapPin size={14} strokeWidth={2} /> From: <strong>{routeData.fromLabel}</strong>
                    {' → '}
                    <Flag size={14} strokeWidth={2} /> To: <strong>{routeData.toLabel}</strong>
                  </p>
                </div>
              </div>
              <div className={styles.headerRight}>
                <div className={styles.routeBadges}>
                  <span className={styles.routeBadge} style={{ background: '#16a34a' }}>Start</span>
                  {!routeData.sameFloor && (
                    <span className={styles.routeBadge} style={{ background: '#f59e0b' }}>Stair</span>
                  )}
                  <span className={styles.routeBadge} style={{ background: '#dc2626' }}>End</span>
                </div>
                {currentEntry && (
                  <button
                    type="button"
                    className={`${styles.saveBtn} ${currentSaved ? styles.saveBtnActive : ''}`}
                    onClick={() => toggleSaved(currentEntry)}
                  >
                    {currentSaved
                      ? <><Star size={14} strokeWidth={2} fill="currentColor" /> Saved</>
                      : <><Star size={14} strokeWidth={2} /> Save route</>}
                  </button>
                )}
              </div>
            </div>

            {/* Estimated walking time (display-only, derived from the route path) */}
            {(() => {
              const walk = estimateWalk(routeData);
              return (
                <div className={styles.walkStats}>
                  <div className={styles.walkStat}>
                    <span className={styles.walkStatIcon}><Footprints size={20} strokeWidth={2} /></span>
                    <div>
                      <span className={styles.walkStatValue}>~{walk.minutes} min</span>
                      <span className={styles.walkStatLabel}>Est. walk time</span>
                    </div>
                  </div>
                  <div className={styles.walkStat}>
                    <span className={styles.walkStatIcon}><Ruler size={20} strokeWidth={2} /></span>
                    <div>
                      <span className={styles.walkStatValue}>~{walk.meters} m</span>
                      <span className={styles.walkStatLabel}>Distance</span>
                    </div>
                  </div>
                  {!routeData.sameFloor && (
                    <div className={styles.walkStat}>
                      <span className={styles.walkStatIcon}><MoveVertical size={20} strokeWidth={2} /></span>
                      <div>
                        <span className={styles.walkStatValue}>Stair {routeData.stairNum}</span>
                        <span className={styles.walkStatLabel}>Floor {routeData.fromFloor} → {routeData.toFloor}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <NavigationMap data={routeData} />
          </div>
        )}
      </main>
    </div>
  );
}
