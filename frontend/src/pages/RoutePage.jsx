import { useState, useRef, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpDown, ArrowRight, Star, Clock, Map, MapPin, Flag,
  Footprints, Ruler, MoveVertical,
} from 'lucide-react';
import NavigationMap from '../components/NavigationMap';
import PinPicker from '../components/PinPicker';
import { api } from '../api';
import styles from './RoutePage.module.css';
import { readStoredJson, writeStoredJson } from '../lib/storage';

// ─── Room lists per floor ─────────────────────────────────────────────────────

// Exactly the rooms the school lists for each floor, matching ROOM_LABELS in
// backend/data/roomCoordinates.js. Entries are labels rather than numbers
// because some destinations are named places (the GYM, Reception, the
// Xchange/Library) and some cover a pair of rooms behind one door ("281/283").
const ROOMS = {
  1: ['116', '121', '123', '144', '147', '157', '172', '174', '181', '184',
      '188', '189', '191', '192', 'Clinic', 'Courtyard', 'GYM', 'Hangar East',
      'Hangar West', 'Mission Control', 'Reception'],
  2: ['223', '233', '235', '236', '242', '244', '246', '249', '251', '252',
      '253', '258', '261', '262', '263', '265', '267', '268', '272', '273',
      '274', '275', '277', '281/283', '282/284', '291/293', '292/294',
      'BioTech Lab', 'Xchange/Library'],
  3: ['301', '322', '324', '331', '332', '333', '334', '342', '345', '346',
      '349', '351', '354', '356', '359', '362', '363', '364', '367', '372',
      '373', '375', '377', '381/383', '382/384', '391/393', '392/394',
      'Xchange/Library'],
};

// "Room 184", but just "Reception" — prefixing a named place reads as a mistake.
export const displayName = (room) => (/^\d/.test(String(room)) ? `Room ${room}` : String(room));

// ─── Floor-tabbed room selector ───────────────────────────────────────────────

function FloorRoomSelector({ label, dotColor, selectedFloor, selectedRoom, onFloorChange, onRoomChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1); // keyboard-highlighted option (M4)
  const wrapRef = useRef(null);
  const listId = useId();

  const rooms = ROOMS[selectedFloor] || [];
  // Match on the label and on what's shown, so typing either "184" or
  // "room 184" finds it, and "gym" finds the GYM.
  const filtered = rooms.filter(n => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(n).toLowerCase().includes(q) || displayName(n).toLowerCase().includes(q);
  });

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
    setQuery(displayName(roomNum));
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
    setQuery(selectedRoom ? displayName(selectedRoom) : '');
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
                {displayName(n)}
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

export function pathLengthPx(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    total += Math.hypot(dx, dy);
  }
  return total;
}

export function estimateWalk(data) {
  const px = pathLengthPx(data.path1) + pathLengthPx(data.path2);
  const meters = px * M_PER_PX;
  const floorChanges = data.sameFloor
    ? 0
    : Math.abs((data.toFloor || 0) - (data.fromFloor || 0));
  const seconds = meters / WALK_SPEED_MPS + floorChanges * STAIR_SECONDS;
  return { minutes: Math.max(1, Math.round(seconds / 60)), meters: Math.round(meters) };
}

// ─── Saved / recent route storage ─────────────────────────────────────────────
// localStorage throws outright in some browsers (Safari private mode, "block
// all cookies", embedded webviews). These are a convenience feature, so a
// storage failure must degrade to "no saved routes" rather than taking the
// Route Finder down with it.

export function readRouteList(key) {
  const parsed = readStoredJson(key, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(r => r && typeof r === 'object' && r.fromKey && r.toKey);
}

export function writeRouteList(key, value) {
  writeStoredJson(key, value);   // storage unavailable? the in-memory list still works
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

  // ── Pin mode ──
  // 'rooms'  — pick both ends by name (the original Route Finder).
  // 'pin'    — drop the start on the plan; the destination is either a room or
  //            a second pin. Coordinates are blueprint space, same as the router.
  const [mode,        setMode]        = useState('rooms');
  const [startPin,    setStartPin]    = useState(null);   // { x, y, floor }
  const [endPin,      setEndPin]      = useState(null);
  const [pinFromFloor, setPinFromFloor] = useState(1);
  const [pinToFloor,   setPinToFloor]   = useState(1);
  const [destKind,    setDestKind]    = useState('room'); // 'room' | 'pin'
  const [pinToRoom,   setPinToRoom]   = useState('');

  const mapRef = useRef(null);
  // Increments on every lookup, so a slow earlier response can't land on top of
  // a faster later one and show a route the user is no longer asking for.
  const requestSeq = useRef(0);

  // Load saved + recent routes (localStorage only — no effect on pathfinding).
  // Anything that isn't an array of route entries is treated as absent: stored
  // JSON can be from an older version of the app, hand-edited, or truncated,
  // and a non-array here would crash the chip list on render.
  useEffect(() => {
    setRecents(readRouteList('ia_recent_routes'));
    setSaved(readRouteList('ia_saved_routes'));
  }, []);

  const keyOf = r => `${r.fromFloor}:${r.fromKey}->${r.toFloor}:${r.toKey}`;

  function addRecent(entry) {
    setRecents(prev => {
      const next = [entry, ...prev.filter(r => keyOf(r) !== keyOf(entry))].slice(0, 6);
      writeRouteList('ia_recent_routes', next);
      return next;
    });
  }

  function toggleSaved(entry) {
    setSaved(prev => {
      const exists = prev.some(r => keyOf(r) === keyOf(entry));
      const next = exists
        ? prev.filter(r => keyOf(r) !== keyOf(entry))
        : [entry, ...prev].slice(0, 12);
      writeRouteList('ia_saved_routes', next);
      return next;
    });
  }

  function removeSaved(entry) {
    setSaved(prev => {
      const next = prev.filter(r => keyOf(r) !== keyOf(entry));
      writeRouteList('ia_saved_routes', next);
      return next;
    });
  }

  const currentEntry = fromKey && toKey ? { fromFloor, fromKey, toFloor, toKey } : null;
  const currentSaved = currentEntry && saved.some(r => keyOf(r) === keyOf(currentEntry));

  async function findRouteWith(fFloor, fKey, tFloor, tKey) {
    const seq = ++requestSeq.current;
    setError('');
    setLoading(true);
    setRouteData(null);
    try {
      const data = await api.findRoute({ fromRoom: fKey, fromFloor: fFloor, toRoom: tKey, toFloor: tFloor });
      if (seq !== requestSeq.current) return; // superseded by a newer lookup
      // A route with fewer than two waypoints can't be drawn. Treat it as the
      // failure it is instead of rendering "Route Found" over a blank map.
      if (!Array.isArray(data.path1) || data.path1.length < 2) {
        setError('No walkable route could be found between those two locations. Please pick a different start or destination.');
        return;
      }
      setRouteData(data);
      addRecent({ fromFloor: fFloor, fromKey: fKey, toFloor: tFloor, toKey: tKey });
      setTimeout(() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err.message || 'Unable to connect to server. Make sure the backend is running.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
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

  // Pin mode's own lookup. Shares the same request-sequence guard and the same
  // "a route needs two waypoints to be drawable" check as the room lookup.
  async function handleFindPinRoute(e) {
    e.preventDefault();
    if (!startPin) {
      setError('Tap the map to set your starting point.');
      return;
    }
    const to = destKind === 'room'
      ? (pinToRoom ? { kind: 'room', room: pinToRoom, floor: pinToFloor } : null)
      : (endPin ? { kind: 'point', x: endPin.x, y: endPin.y, floor: endPin.floor } : null);
    if (!to) {
      setError(destKind === 'room'
        ? 'Choose a destination room.'
        : 'Tap the destination map to set where you are going.');
      return;
    }
    const from = { kind: 'point', x: startPin.x, y: startPin.y, floor: startPin.floor };
    if (to.kind === 'point' && to.floor === from.floor && to.x === from.x && to.y === from.y) {
      setError('Start and destination are the same spot.');
      return;
    }

    const seq = ++requestSeq.current;
    setError('');
    setLoading(true);
    setRouteData(null);
    try {
      const data = await api.findPinRoute({ from, to });
      if (seq !== requestSeq.current) return;
      if (!Array.isArray(data.path1) || data.path1.length < 2) {
        setError('No walkable route could be found between those two spots. Try a point closer to a hallway.');
        return;
      }
      setRouteData(data);
      setTimeout(() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err.message || 'Unable to connect to server. Make sure the backend is running.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  // Switching mode clears the previous mode's result, so a route from the other
  // mode can't sit under controls that no longer produced it.
  function switchMode(next) {
    setMode(next);
    setRouteData(null);
    setError('');
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
    setError('');   // the previous lookup's error doesn't apply to the swapped pair
  }

  return (
    <div className={styles.page}>
      {/* ── Navbar ── */}
      <header className={styles.navbar}>
        <Link to="/" className={styles.navLogo}>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.navLogoImg} />
          <span className={styles.navLogoText}>IA Nexus</span>
        </Link>
        <nav className={styles.navLinks}>
          <Link to="/" className={styles.navLink}>Chat</Link>
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
      <main className={`${styles.content} ${mode === 'pin' ? styles.contentWide : ''}`}>
        <div className={styles.modeRow} role="tablist" aria-label="How to choose locations">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'rooms'}
            className={`${styles.modeTab} ${mode === 'rooms' ? styles.modeTabActive : ''}`}
            onClick={() => switchMode('rooms')}
          >
            Pick rooms
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pin'}
            className={`${styles.modeTab} ${mode === 'pin' ? styles.modeTabActive : ''}`}
            onClick={() => switchMode('pin')}
          >
            <MapPin size={14} strokeWidth={2.2} /> Drop a pin
          </button>
        </div>

        {mode === 'pin' ? (
          <form className={styles.card} onSubmit={handleFindPinRoute}>
            <div className={styles.pinGrid}>
              {/* ── Start: always a pin ── */}
              <div className={styles.pinCol}>
                <span className={styles.label}>
                  <span className={styles.labelDot} style={{ background: '#16a34a' }} />
                  Where you are
                </span>
                <div className={styles.floorTabs}>
                  {[1, 2, 3].map(f => (
                    <button
                      key={f}
                      type="button"
                      className={`${styles.floorTab} ${pinFromFloor === f ? styles.floorTabActive : ''}`}
                      onClick={() => setPinFromFloor(f)}
                    >
                      Floor {f}
                    </button>
                  ))}
                </div>
                <PinPicker
                  floor={pinFromFloor}
                  value={startPin}
                  onChange={setStartPin}
                  color="#16a34a"
                  label="Tap anywhere on this floor to mark where you are"
                />
              </div>

              {/* ── Destination: a room, or a second pin ── */}
              <div className={styles.pinCol}>
                <span className={styles.label}>
                  <span className={styles.labelDot} style={{ background: '#dc2626' }} />
                  Where you&rsquo;re going
                </span>
                <div className={styles.destKindRow}>
                  <button
                    type="button"
                    className={`${styles.destKindBtn} ${destKind === 'room' ? styles.destKindBtnActive : ''}`}
                    onClick={() => { setDestKind('room'); setError(''); }}
                  >
                    A room
                  </button>
                  <button
                    type="button"
                    className={`${styles.destKindBtn} ${destKind === 'pin' ? styles.destKindBtnActive : ''}`}
                    onClick={() => { setDestKind('pin'); setError(''); }}
                  >
                    Another pin
                  </button>
                </div>

                <div className={styles.floorTabs}>
                  {[1, 2, 3].map(f => (
                    <button
                      key={f}
                      type="button"
                      className={`${styles.floorTab} ${pinToFloor === f ? styles.floorTabActive : ''}`}
                      onClick={() => { setPinToFloor(f); setPinToRoom(''); }}
                    >
                      Floor {f}
                    </button>
                  ))}
                </div>

                {destKind === 'room' ? (
                  <div className={styles.roomGrid}>
                    {ROOMS[pinToFloor].map(r => (
                      <button
                        key={r}
                        type="button"
                        className={`${styles.roomChip} ${pinToRoom === r ? styles.roomChipActive : ''}`}
                        onClick={() => { setPinToRoom(r); setError(''); }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                ) : (
                  <PinPicker
                    floor={pinToFloor}
                    value={endPin}
                    onChange={setEndPin}
                    color="#dc2626"
                    label="Tap anywhere on this floor to mark your destination"
                  />
                )}
              </div>
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <button type="submit" className={styles.findBtn} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : (
                <>
                  <span className={styles.findBtnIcon}><ArrowRight size={18} strokeWidth={2.2} /></span>
                  Find Route
                </>
              )}
            </button>
          </form>
        ) : (
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
        )}

        {/* ── Saved + recent quick routes ── */}
        {mode === 'rooms' && (saved.length > 0 || recents.length > 0) && (
          <div className={styles.quickRoutes}>
            {saved.length > 0 && (
              <div className={styles.quickGroup}>
                <p className={styles.quickLabel}><Star size={13} strokeWidth={2} fill="currentColor" /> Saved</p>
                <div className={styles.chipRow}>
                  {saved.map(r => (
                    <div key={keyOf(r)} className={styles.chip}>
                      <button className={styles.chipMain} onClick={() => runQuickRoute(r)} disabled={loading}>
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
                      <button className={styles.chipMain} onClick={() => runQuickRoute(r)} disabled={loading}>
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
