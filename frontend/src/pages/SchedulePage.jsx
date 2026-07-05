import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Map, Cloud, CloudOff, Check } from 'lucide-react';
import { api } from '../api';
import { BELL, getScheduleStatus, secondsUntil, formatCountdown } from '../lib/schedule';
import RouteMapModal from '../components/RouteMapModal';
import styles from './SchedulePage.module.css';

// localStorage is now an OFFLINE CACHE; the cloud (per-account) is the source of
// truth so a student's schedule follows them across devices.
const STORAGE_KEY = 'ia_my_schedule';

// Normalize any stored shape to { period: { room, teacher } }. Handles the legacy
// format where each value was a bare room string, so old saved schedules still load.
function normalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [p, v] of Object.entries(raw)) {
    if (!/^[1-8]$/.test(p)) continue;
    out[p] = (v && typeof v === 'object')
      ? { room: String(v.room || ''), teacher: String(v.teacher || '') }
      : { room: String(v || ''), teacher: '' };
  }
  return out;
}

function loadCache() {
  try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return {}; }
}
function cacheSchedule(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
const roomOf = (sched, p) => (p ? (sched[p]?.room || '') : '');
const floorOf = (room) => {
  const n = parseInt(room, 10);
  if (isNaN(n)) return null;
  const f = Math.floor(n / 100);
  return f >= 1 && f <= 3 ? f : null;
};

export default function SchedulePage() {
  // Paint instantly from the offline cache, then reconcile with the cloud.
  const [sched, setSched] = useState(loadCache);
  const [now, setNow] = useState(() => new Date());
  const [routeModal, setRouteModal] = useState(null);
  const [sync, setSync] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'offline'
  const saveTimer = useRef(null);
  const savedTimer = useRef(null);

  // Tick the clock for the "up next" countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  // On mount: load the cloud schedule. If the cloud is empty but this device has
  // a local schedule (a pre-sync user), migrate it up once.
  useEffect(() => {
    let alive = true;
    api.getSchedule()
      .then(({ schedule }) => {
        if (!alive) return;
        const cloud = normalize(schedule);
        const local = loadCache();
        if (Object.keys(cloud).length === 0 && Object.keys(local).length > 0) {
          setSched(local);
          api.saveSchedule(local).catch(() => {});
        } else {
          setSched(cloud);
          cacheSchedule(cloud);
        }
        setSync('idle');
      })
      .catch(() => { if (alive) setSync('offline'); }); // keep the cached copy
    return () => {
      alive = false;
      clearTimeout(saveTimer.current);
      clearTimeout(savedTimer.current);
    };
  }, []);

  function pushToCloud(next) {
    setSync('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveSchedule(next)
        .then(() => {
          setSync('saved');
          clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setSync('idle'), 1600);
        })
        .catch(() => setSync('offline'));
    }, 600);
  }

  function updateField(period, field, value) {
    const cur = sched[period] || { room: '', teacher: '' };
    const updated = field === 'room'
      ? { ...cur, room: value.replace(/[^0-9]/g, '').slice(0, 3) }
      : { ...cur, teacher: value.slice(0, 60) };
    const next = { ...sched, [period]: updated };
    setSched(next);
    cacheSchedule(next);   // instant offline cache
    pushToCloud(next);     // debounced cloud sync
  }

  // ── Work out the current + next class from the live schedule status ──
  const status = getScheduleStatus(now);
  let currentP = null, nextP = null, countdownLabel = '';
  if (status.state === 'in') {
    currentP = status.period;
    nextP = status.period < 8 ? status.period + 1 : null;
    countdownLabel = `Current class ends in ${formatCountdown(secondsUntil(status.targetSec, now))}`;
  } else if (status.state === 'passing') {
    nextP = status.nextPeriod;
    currentP = status.nextPeriod - 1 >= 1 ? status.nextPeriod - 1 : null;
    countdownLabel = `Starts in ${formatCountdown(secondsUntil(status.targetSec, now))}`;
  } else if (status.state === 'before') {
    nextP = 1;
    countdownLabel = `Starts in ${formatCountdown(secondsUntil(status.targetSec, now))}`;
  }

  const currentRoom = roomOf(sched, currentP);
  const nextRoom = roomOf(sched, nextP);
  const nextTeacher = nextP ? (sched[nextP]?.teacher || '') : '';
  const nextBell = nextP ? BELL.find(b => b.period === nextP) : null;
  const canRoute = floorOf(currentRoom) && floorOf(nextRoom) && currentRoom !== nextRoom;

  async function showRouteToNext() {
    if (!canRoute) return;
    setRouteModal({ loading: true, error: '', data: null, from: currentRoom, to: nextRoom });
    try {
      const data = await api.findRoute({
        fromRoom: currentRoom, fromFloor: floorOf(currentRoom),
        toRoom: nextRoom, toFloor: floorOf(nextRoom),
      });
      setRouteModal({ loading: false, error: '', data, from: currentRoom, to: nextRoom });
    } catch (e) {
      setRouteModal({ loading: false, error: e.message || 'Could not find that route.', data: null, from: currentRoom, to: nextRoom });
    }
  }

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <header className={styles.navbar}>
        <Link to="/app" className={styles.navLogo}>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.navLogoImg} />
          <span className={styles.navLogoText}>IA Nexus</span>
        </Link>
        <nav className={styles.navLinks}>
          <Link to="/app" className={styles.navLink}>Chat</Link>
          <Link to="/route" className={styles.navLink}>Route Finder</Link>
          <Link to="/schedule" className={`${styles.navLink} ${styles.navLinkActive}`}>My Schedule</Link>
          <Link to="/teachers" className={styles.navLink}>Teachers</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>Your day</p>
        <h1 className={styles.heroTitle}>My Schedule</h1>
        <p className={styles.heroSub}>Save your classes once — IA Nexus will show what's next and route you there.</p>
      </section>

      <main className={styles.content}>
        {/* ── Up next card ── */}
        <div className={styles.upNext}>
          {nextP && nextBell ? (
            <>
              <div className={styles.upNextMain}>
                <span className={styles.upNextLabel}>Up next</span>
                <span className={styles.upNextClass}>{nextBell.label}</span>
                <span className={styles.upNextTime}>{nextBell.start}{countdownLabel ? ` · ${countdownLabel}` : ''}</span>
              </div>
              <div className={styles.upNextRoom}>
                {nextRoom
                  ? <><span className={styles.upNextRoomNum}>Room {nextRoom}</span><span className={styles.upNextFloor}>Floor {floorOf(nextRoom) || '?'}</span></>
                  : <span className={styles.upNextUnset}>No room set for this period</span>}
                {nextTeacher && <span className={styles.upNextTeacher}>{nextTeacher}</span>}
              </div>
              {canRoute && (
                <button className={styles.routeBtn} onClick={showRouteToNext}>
                  <Map size={16} strokeWidth={2} /> Route from {currentRoom} → {nextRoom}
                </button>
              )}
            </>
          ) : (
            <div className={styles.upNextMain}>
              <span className={styles.upNextLabel}>Up next</span>
              <span className={styles.upNextClass}>
                {status.state === 'weekend' ? 'No school today' : 'No more classes today'}
              </span>
            </div>
          )}
        </div>

        {/* ── Editor ── */}
        <div className={styles.editorCard}>
          <div className={styles.editorHead}>
            <p className={styles.editorTitle}>Your classes</p>
            {sync === 'saving' && <span className={styles.syncBadge}><Cloud size={13} strokeWidth={2} /> Saving…</span>}
            {sync === 'saved' && <span className={`${styles.syncBadge} ${styles.syncOk}`}><Check size={13} strokeWidth={2.4} /> Saved</span>}
            {sync === 'offline' && <span className={`${styles.syncBadge} ${styles.syncOff}`}><CloudOff size={13} strokeWidth={2} /> Saved on this device</span>}
          </div>
          <p className={styles.editorHint}>Enter the room and teacher for each period. Synced to your account automatically.</p>
          <div className={styles.rows}>
            {BELL.map(b => {
              const entry = sched[b.period] || { room: '', teacher: '' };
              const room = entry.room || '';
              const f = floorOf(room);
              const isNow = currentP === b.period;
              return (
                <div key={b.period} className={`${styles.row} ${isNow ? styles.rowNow : ''}`}>
                  <div className={styles.rowLabel}>
                    <span className={styles.rowPeriod}>{b.label}</span>
                    <span className={styles.rowTime}>{b.start} – {b.end}</span>
                  </div>
                  <div className={styles.rowInputs}>
                    <div className={styles.rowInputWrap}>
                      <span className={styles.rowRoomPrefix}>Room</span>
                      <input
                        className={styles.rowInput}
                        type="text"
                        inputMode="numeric"
                        placeholder="—"
                        value={room}
                        maxLength={3}
                        onChange={e => updateField(b.period, 'room', e.target.value)}
                        aria-label={`${b.label} room`}
                      />
                      <span className={styles.rowFloor}>{room ? (f ? `Floor ${f}` : 'Invalid') : ''}</span>
                    </div>
                    <input
                      className={styles.rowTeacher}
                      type="text"
                      placeholder="Teacher (optional)"
                      value={entry.teacher || ''}
                      maxLength={60}
                      onChange={e => updateField(b.period, 'teacher', e.target.value)}
                      aria-label={`${b.label} teacher`}
                    />
                  </div>
                  {isNow && <span className={styles.nowTag}>NOW</span>}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {routeModal && (
        <RouteMapModal
          from={routeModal.from}
          to={routeModal.to}
          loading={routeModal.loading}
          error={routeModal.error}
          data={routeModal.data}
          onClose={() => setRouteModal(null)}
        />
      )}
    </div>
  );
}
