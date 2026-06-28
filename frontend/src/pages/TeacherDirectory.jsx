import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { api } from '../api';
import { BELL, currentPeriodNumber } from '../lib/schedule';
import styles from './TeacherDirectory.module.css';

// Room-like values are clickable/locatable; words like "planning" or "lunch" are not.
const isRoom = (v) => /^\d{3}/.test(String(v || '').trim());

export default function TeacherDirectory() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const currentPeriod = currentPeriodNumber();

  useEffect(() => {
    let alive = true;
    api.getTeachers()
      .then((data) => { if (alive) setTeachers(Array.isArray(data) ? data : []); })
      .catch((e) => { if (alive) setError(e.message || 'Could not load the directory.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => {
      if (t.name?.toLowerCase().includes(q)) return true;
      return (t.aliases || []).some((a) => a.toLowerCase().includes(q));
    });
  }, [teachers, query]);

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
          <Link to="/schedule" className={styles.navLink}>My Schedule</Link>
          <Link to="/teachers" className={`${styles.navLink} ${styles.navLinkActive}`}>Teachers</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>Staff</p>
        <h1 className={styles.heroTitle}>Teacher Directory</h1>
        <p className={styles.heroSub}>Search any teacher to see where they are, period by period.</p>
      </section>

      <main className={styles.content}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><Search size={18} strokeWidth={2} /></span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {!loading && !error && (
            <span className={styles.count}>{filtered.length} {filtered.length === 1 ? 'teacher' : 'teachers'}</span>
          )}
        </div>

        {/* States */}
        {loading && (
          <div className={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.skeletonCard} />)}
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <div className={styles.empty}>
            <Users size={32} strokeWidth={1.6} />
            <p>No teachers match “{query}”.</p>
          </div>
        )}

        {/* Teacher cards */}
        {!loading && !error && filtered.length > 0 && (
          <div className={styles.grid}>
            {filtered.map((t) => {
              const nowRoom = currentPeriod ? t.schedule?.[String(currentPeriod)] : null;
              return (
                <div key={t.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.teacherName}>{t.name}</span>
                    {currentPeriod && nowRoom && (
                      <span className={styles.nowBadge}>
                        Now · {isRoom(nowRoom) ? `Room ${nowRoom}` : nowRoom}
                      </span>
                    )}
                  </div>
                  <div className={styles.schedGrid}>
                    {BELL.map((b) => {
                      const room = t.schedule?.[String(b.period)] || '—';
                      const active = b.period === currentPeriod;
                      return (
                        <div key={b.period} className={`${styles.cell} ${active ? styles.cellNow : ''}`}>
                          <span className={styles.cellPeriod}>P{b.period}</span>
                          <span className={`${styles.cellRoom} ${isRoom(room) ? '' : styles.cellRoomWord}`}>{room}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
