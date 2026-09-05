import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Lock, RefreshCw, AlertTriangle, MessageSquare,
  Star, ScrollText, Activity, LogOut,
} from 'lucide-react';
import { api } from '../api';
import { readStored, writeStored, removeStored } from '../lib/storage';
import styles from './Admin.module.css';

// The admin key is NOT a user session — it is a single shared secret sent as an
// x-admin-key header (see ADMIN_KEY in backend/server.js). It is kept in
// sessionStorage rather than localStorage on purpose: it should not outlive the
// browser session, and it must never sit alongside the ordinary user token.
const KEY_STORAGE = 'ia_admin_key';
const readKey = () => readStored(KEY_STORAGE, { session: true }) || '';

const TABS = [
  { id: 'stats',    label: 'Overview',        Icon: Activity },
  { id: 'questions', label: 'Questions',      Icon: MessageSquare },
  { id: 'flagged',  label: 'Flagged',         Icon: AlertTriangle },
  { id: 'feedback', label: 'Feedback',        Icon: Star },
  { id: 'security', label: 'Security events', Icon: ShieldCheck },
  { id: 'audit',    label: 'Access log',      Icon: ScrollText },
];

const PAGE = 50;

function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

// Everything rendered here is user-submitted content (questions, feedback
// comments, emails). React escapes it by default and nothing on this page uses
// dangerouslySetInnerHTML — that is deliberate, not incidental.
function Cell({ children, mono = false, wrap = false }) {
  return (
    <td className={`${mono ? styles.mono : ''} ${wrap ? styles.wrap : ''}`}>
      {children === null || children === undefined || children === '' ? <span className={styles.dim}>—</span> : children}
    </td>
  );
}

// ─── Key prompt ───────────────────────────────────────────────────────────────

function KeyGate({ onSubmit, error, busy }) {
  const [value, setValue] = useState('');
  return (
    <div className={styles.gate}>
      <form
        className={styles.gateCard}
        onSubmit={(e) => { e.preventDefault(); onSubmit(value.trim()); }}
      >
        <div className={styles.gateIcon}><Lock size={26} strokeWidth={1.9} /></div>
        <h1 className={styles.gateTitle}>Admin dashboard</h1>
        <p className={styles.gateSub}>
          Enter the admin key for this deployment. It is not a user account —
          it is the <code>ADMIN_KEY</code> set in the server environment.
        </p>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <input
          className={styles.gateInput}
          type="password"
          placeholder="Admin key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          autoComplete="off"
          aria-label="Admin key"
        />
        <button className={styles.gateBtn} type="submit" disabled={busy || !value.trim()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <Link to="/" className={styles.gateBack}>Back to IA Nexus</Link>
      </form>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Stat({ label, value, tone }) {
  return (
    <div className={`${styles.stat} ${tone ? styles[tone] : ''}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function Overview({ data }) {
  if (!data) return null;
  const days = data.questionsPerDay || [];
  const peak = Math.max(1, ...days.map(d => d.n));
  return (
    <>
      <div className={styles.statGrid}>
        <Stat label="Accounts" value={data.users} />
        <Stat label="Conversations" value={data.chats} />
        <Stat label="Questions asked" value={data.questions} />
        <Stat label="Unanswered" value={data.unresolved} tone={data.unresolved > 0 ? 'warn' : undefined} />
        <Stat label="Flagged" value={data.flagged} tone={data.flagged > 0 ? 'bad' : undefined} />
        <Stat
          label={`Avg rating (${data.feedbackCount})`}
          value={data.averageRating === null ? '—' : `${data.averageRating} / 5`}
        />
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Questions, last 7 days</h2>
        {days.length === 0 ? (
          <p className={styles.empty}>No questions recorded in the last 7 days.</p>
        ) : (
          <div className={styles.bars}>
            {days.map(d => (
              <div key={d.day} className={styles.barCol}>
                <span className={styles.chartBarValue}>{d.n}</span>
                <div className={styles.chartBar} style={{ height: `${Math.round((d.n / peak) * 100)}%` }} />
                <span className={styles.chartBarLabel}>{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>By mode</h2>
        <ul className={styles.kvList}>
          {Object.entries(data.questionsByMode || {}).map(([mode, n]) => (
            <li key={mode}><span>{mode === 'rule' ? 'Rule based' : 'Interactive (AI)'}</span><strong>{n}</strong></li>
          ))}
          {Object.keys(data.questionsByMode || {}).length === 0 && <li><span>No data yet</span></li>}
        </ul>
      </div>

      <p className={styles.note}>
        Question content is purged after {data.retentionDays?.analytics} days;
        security events after {data.retentionDays?.securityEvents} days; this
        dashboard's own access log after {data.retentionDays?.adminAudit} days.
      </p>
    </>
  );
}

// ─── Paged table ──────────────────────────────────────────────────────────────

function DataTable({ columns, rows, loading, error, hasMore, onLoadMore, emptyText }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!loading && rows.length === 0) return <p className={styles.empty}>{emptyText}</p>;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>{columns.map(c => <th key={c.key} className={c.narrow ? styles.narrow : ''}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>{columns.map(c => c.render(r))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <p className={styles.empty}>Loading…</p>}
      {hasMore && !loading && (
        <button className={styles.moreBtn} onClick={onLoadMore}>Load more</button>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Admin() {
  const [adminKey, setAdminKey] = useState(readKey);
  const [gateError, setGateError] = useState('');
  const [gateBusy, setGateBusy] = useState(false);

  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function signOut() {
    removeStored(KEY_STORAGE, { session: true });
    setAdminKey('');
    setStats(null);
    setRows([]);
    setTab('stats');
  }

  // A 401 anywhere means the key is wrong or was revoked — drop it and go back
  // to the prompt rather than leaving a dashboard that fails every request.
  const handle = useCallback((e) => {
    if (/^Unauthorized$/i.test(e.message)) {
      removeStored(KEY_STORAGE, { session: true });
      setAdminKey('');
      setGateError('That key was rejected.');
      return true;
    }
    return false;
  }, []);

  async function unlock(key) {
    setGateBusy(true);
    setGateError('');
    try {
      // Verify before storing, so a wrong key never gets remembered.
      const s = await api.admin.stats(key);
      writeStored(KEY_STORAGE, key, { session: true });
      setAdminKey(key);
      setStats(s);
    } catch (e) {
      setGateError(
        /^Unauthorized$/i.test(e.message)
          ? 'That key was rejected. Check ADMIN_KEY in the server environment.'
          : e.message || 'Could not reach the server.'
      );
    } finally {
      setGateBusy(false);
    }
  }

  const fetchers = {
    questions: api.admin.questions,
    flagged: api.admin.flagged,
    feedback: api.admin.feedback,
    security: api.admin.securityEvents,
    audit: api.admin.auditLog,
  };

  const load = useCallback(async (which, from) => {
    if (!adminKey) return;
    setLoading(true);
    setError('');
    try {
      if (which === 'stats') {
        setStats(await api.admin.stats(adminKey));
      } else {
        const res = await fetchers[which](adminKey, PAGE, from);
        setRows(prev => (from === 0 ? res.rows : [...prev, ...res.rows]));
        setOffset(from + res.rows.length);
        setHasMore(res.hasMore);
      }
    } catch (e) {
      if (!handle(e)) setError(e.message || 'Could not load that.');
    } finally {
      setLoading(false);
    }
    // fetchers is rebuilt each render but only ever reads from the stable
    // `api` object, so it is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, handle]);

  // Reset paging whenever the tab changes, so switching tabs never shows the
  // previous tab's rows under the new tab's headers.
  useEffect(() => {
    if (!adminKey) return;
    setRows([]);
    setOffset(0);
    setHasMore(false);
    load(tab, 0);
  }, [tab, adminKey, load]);

  if (!adminKey) {
    return <KeyGate onSubmit={unlock} error={gateError} busy={gateBusy} />;
  }

  const TABLES = {
    questions: {
      emptyText: 'No questions have been asked yet.',
      columns: [
        { key: 'when', label: 'When', narrow: true, render: r => <Cell key="w" mono>{fmtTime(r.created_at)}</Cell> },
        { key: 'who', label: 'Who', narrow: true, render: r => <Cell key="u">{r.user_email || (r.source === 'guest' ? 'guest' : null)}</Cell> },
        { key: 'mode', label: 'Mode', narrow: true, render: r => <Cell key="m">{r.mode === 'rule' ? 'Rule' : 'AI'}</Cell> },
        { key: 'q', label: 'Question', render: r => <Cell key="c" wrap>{r.content}</Cell> },
        { key: 'a', label: 'Answer', render: r => <Cell key="r" wrap>{r.response}</Cell> },
        {
          key: 'ok', label: 'Answered', narrow: true,
          render: r => (
            <Cell key="o">
              {r.resolved === null || r.resolved === undefined
                ? <span className={styles.dim}>—</span>
                : r.resolved ? <span className={styles.ok}>yes</span> : <span className={styles.warnText}>no</span>}
            </Cell>
          ),
        },
      ],
    },
    flagged: {
      emptyText: 'Nothing has been flagged. ',
      columns: [
        { key: 'when', label: 'When', narrow: true, render: r => <Cell key="w" mono>{fmtTime(r.created_at)}</Cell> },
        { key: 'who', label: 'Who', narrow: true, render: r => <Cell key="u">{r.user_email || 'guest'}</Cell> },
        { key: 'c', label: 'Message', render: r => <Cell key="c" wrap>{r.content}</Cell> },
        {
          key: 'm', label: 'Matched', narrow: true,
          render: r => {
            let words = r.matched_words;
            try { words = JSON.parse(words).join(', '); } catch { /* stored as-is */ }
            return <Cell key="m">{words}</Cell>;
          },
        },
      ],
    },
    feedback: {
      emptyText: 'No feedback has been submitted yet.',
      columns: [
        { key: 'when', label: 'When', narrow: true, render: r => <Cell key="w" mono>{fmtTime(r.created_at)}</Cell> },
        { key: 'who', label: 'Who', narrow: true, render: r => <Cell key="u">{r.user_email || 'guest'}</Cell> },
        { key: 'r', label: 'Rating', narrow: true, render: r => <Cell key="r">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Cell> },
        { key: 'c', label: 'Comment', render: r => <Cell key="c" wrap>{r.comment}</Cell> },
      ],
    },
    security: {
      emptyText: 'No security events recorded.',
      columns: [
        { key: 'when', label: 'When', narrow: true, render: r => <Cell key="w" mono>{fmtTime(r.created_at)}</Cell> },
        { key: 't', label: 'Event', narrow: true, render: r => <Cell key="t" mono>{r.event_type}</Cell> },
        { key: 'ip', label: 'IP', narrow: true, render: r => <Cell key="i" mono>{r.ip}</Cell> },
        { key: 'e', label: 'Email', render: r => <Cell key="e">{r.email}</Cell> },
        { key: 'p', label: 'Path', narrow: true, render: r => <Cell key="p" mono>{r.path}</Cell> },
        { key: 'd', label: 'Detail', narrow: true, render: r => <Cell key="d">{r.detail}</Cell> },
      ],
    },
    audit: {
      emptyText: 'This dashboard has not been accessed before.',
      columns: [
        { key: 'when', label: 'When', narrow: true, render: r => <Cell key="w" mono>{fmtTime(r.created_at)}</Cell> },
        { key: 'ip', label: 'IP', narrow: true, render: r => <Cell key="i" mono>{r.ip}</Cell> },
        { key: 'p', label: 'Path', render: r => <Cell key="p" mono>{r.path}</Cell> },
        {
          key: 's', label: 'Result', narrow: true,
          render: r => <Cell key="s">{r.success ? <span className={styles.ok}>allowed</span> : <span className={styles.badText}>rejected</span>}</Cell>,
        },
      ],
    },
  };

  const active = TABLES[tab];

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.brand}>
          <ShieldCheck size={18} strokeWidth={2} />
          <span>IA Nexus · Admin</span>
        </div>
        <div className={styles.barActions}>
          <button className={styles.iconBtn} onClick={() => load(tab, 0)} disabled={loading} title="Refresh">
            <RefreshCw size={15} strokeWidth={2} /> Refresh
          </button>
          <button className={styles.iconBtn} onClick={signOut} title="Forget the admin key">
            <LogOut size={15} strokeWidth={2} /> Lock
          </button>
        </div>
      </header>

      <nav className={styles.tabs} role="tablist">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} strokeWidth={2} /> {label}
          </button>
        ))}
      </nav>

      <main className={styles.content}>
        {tab === 'stats' ? (
          <>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {loading && !stats && <p className={styles.empty}>Loading…</p>}
            <Overview data={stats} />
          </>
        ) : (
          <DataTable
            columns={active.columns}
            rows={rows}
            loading={loading}
            error={error}
            hasMore={hasMore}
            onLoadMore={() => load(tab, offset)}
            emptyText={active.emptyText}
          />
        )}
      </main>
    </div>
  );
}
