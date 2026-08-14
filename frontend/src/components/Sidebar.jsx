import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Map, Calendar, Users, Search, Bell, ChevronRight,
  MessageSquare, Settings, LogOut, Pencil, X, Home, LogIn, UserPlus, MessageSquareHeart,
} from 'lucide-react';
import SettingsModal from './SettingsModal';
import PeriodBanner from './PeriodBanner';
import GuestLoginPrompt from './GuestLoginPrompt';
import FeedbackModal from './FeedbackModal';
import { BELL, currentPeriodNumber } from '../lib/schedule';
import styles from './Sidebar.module.css';

// A nav item that behaves as a normal link once signed in, but for a guest
// opens a "log in to use this" prompt instead of navigating to a page that
// would just bounce them straight back.
function NavItem({ to, icon, label, isGuest, onGuestClick }) {
  if (isGuest) {
    return (
      <button className={styles.routeFinderBtn} onClick={onGuestClick}>
        <span className={styles.routeFinderIcon}>{icon}</span>
        {label}
      </button>
    );
  }
  return (
    <Link to={to} className={styles.routeFinderBtn}>
      <span className={styles.routeFinderIcon}>{icon}</span>
      {label}
    </Link>
  );
}

export default function Sidebar({
  chats, activeChatId, onNewChat, onSelectChat,
  onDeleteChat, onRenameChat, onLogout, userEmail, userName, loading,
  isOpen, onClose,
  onClearChats, onDeleteAccount, onUpdateName, defaultMode, onDefaultModeChange,
  isGuest,
}) {
  const [search, setSearch] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const [hoveredChat, setHoveredChat] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guestPromptLabel, setGuestPromptLabel] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const currentPeriod = currentPeriodNumber();

  // Close the mobile drawer on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const filtered = chats.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  // Group chats: today vs earlier
  const now = new Date();
  const todayStr = now.toDateString();
  const todayChats = filtered.filter(c => new Date(c.updated_at).toDateString() === todayStr);
  const earlierChats = filtered.filter(c => new Date(c.updated_at).toDateString() !== todayStr);

  return (
    <>
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ''}`}
        onClick={onClose}
      />
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
      {/* Logo */}
      <div className={styles.logoRow}>
        <img src="/phoenix.png" alt="IA Phoenix" className={styles.logoImg} />
        <span className={styles.logo}>IA Nexus</span>
      </div>

      {/* New Chat */}
      <button className={styles.newChat} onClick={onNewChat}>
        <span className={styles.newChatIcon}><Plus size={18} strokeWidth={2.4} /></span>
        New Chat
      </button>

      {/* ── Navigate ── */}
      <p className={styles.groupLabel}>Navigate</p>

      {/* Home link — always available, per the "always reachable" nav requirement */}
      <Link to="/home" className={styles.routeFinderBtn}>
        <span className={styles.routeFinderIcon}><Home size={17} strokeWidth={2} /></span>
        Home
      </Link>

      {/* Route Finder is open to everyone — no account needed */}
      <Link to="/route" className={styles.routeFinderBtn}>
        <span className={styles.routeFinderIcon}><Map size={17} strokeWidth={2} /></span>
        Route Finder
      </Link>
      <NavItem
        to="/schedule"
        icon={<Calendar size={17} strokeWidth={2} />}
        label="My Schedule"
        isGuest={isGuest}
        onGuestClick={() => setGuestPromptLabel('My Schedule')}
      />
      <NavItem
        to="/teachers"
        icon={<Users size={17} strokeWidth={2} />}
        label="Teachers"
        isGuest={isGuest}
        onGuestClick={() => setGuestPromptLabel('Teachers')}
      />

      {/* Feedback — open to everyone, guest or signed in */}
      <button className={styles.routeFinderBtn} onClick={() => setFeedbackOpen(true)}>
        <span className={styles.routeFinderIcon}><MessageSquareHeart size={17} strokeWidth={2} /></span>
        Feedback
      </button>

      {/* Live bell-schedule status */}
      <PeriodBanner />

      {/* Bell Schedule (reference) */}
      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => setBellOpen(o => !o)}>
          <span className={styles.sectionIcon}><Bell size={16} strokeWidth={2} /></span>
          <span className={styles.sectionLabel}>Bell Schedule</span>
          <span className={`${styles.chevron} ${bellOpen ? styles.chevronOpen : ''}`}><ChevronRight size={15} strokeWidth={2.4} /></span>
        </button>
        {bellOpen && (
          <div className={styles.bellList}>
            {BELL.map((p) => (
              <div
                key={p.period}
                className={`${styles.bellItem} ${p.period === currentPeriod ? styles.bellActive : ''}`}
              >
                <span className={styles.bellLabel}>{p.label}</span>
                <span className={styles.bellTime}>{p.start} – {p.end}</span>
                {p.period === currentPeriod && <span className={styles.bellNow}>NOW</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Chats (search + history) ── */}
      <div className={styles.library}>
        <div className={styles.libraryHeader}>
          <span className={styles.sectionIcon}><MessageSquare size={15} strokeWidth={2} /></span>
          Chats
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><Search size={15} strokeWidth={2} /></span>
          <input
            className={styles.searchInput}
            placeholder="Search chats…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.chatList}>
          {loading && (
            <div className={styles.skeletonList}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={styles.skeletonItem} style={{ width: `${85 - i * 8}%` }} />
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className={styles.empty}>{search ? 'No chats found' : 'No chats yet'}</p>
          )}

          {todayChats.length > 0 && (
            <>
              <p className={styles.chatGroup}>Today</p>
              {todayChats.map(c => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  active={c.id === activeChatId}
                  onSelect={onSelectChat}
                  onDelete={onDeleteChat}
                  onRename={onRenameChat}
                />
              ))}
            </>
          )}
          {earlierChats.length > 0 && (
            <>
              <p className={styles.chatGroup}>Earlier</p>
              {earlierChats.map(c => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  active={c.id === activeChatId}
                  onSelect={onSelectChat}
                  onDelete={onDeleteChat}
                  onRename={onRenameChat}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {isGuest ? (
        <>
          {/* Guests aren't signed in — surface Log In / Sign Up instead of
              account settings and sign-out. */}
          <Link to="/login" className={styles.settingsBtn}>
            <span className={styles.settingsIcon}><LogIn size={16} strokeWidth={2} /></span>
            Log In
          </Link>
          <Link to="/signup" className={styles.logoutFull}>
            <span className={styles.logoutIcon}><UserPlus size={16} strokeWidth={2} /></span>
            Sign Up
          </Link>
        </>
      ) : (
        <>
          {/* Settings button */}
          <button className={styles.settingsBtn} onClick={() => setSettingsOpen(true)}>
            <span className={styles.settingsIcon}><Settings size={16} strokeWidth={2} /></span>
            Settings
          </button>

          {/* Logout button */}
          <button className={styles.logoutFull} onClick={onLogout}>
            <span className={styles.logoutIcon}><LogOut size={16} strokeWidth={2} /></span>
            Sign Out
          </button>

          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            userEmail={userEmail}
            userName={userName}
            onUpdateName={onUpdateName}
            onLogout={onLogout}
            onClearChats={onClearChats}
            onDeleteAccount={onDeleteAccount}
            defaultMode={defaultMode}
            onDefaultModeChange={onDefaultModeChange}
          />

          {/* User footer */}
          <div className={styles.userRow}>
            <div className={styles.avatar}>
              {(userName || userEmail)[0]?.toUpperCase() || 'U'}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userEmail}>{userName || userEmail}</span>
              <span className={styles.userRole}>{userName ? userEmail : 'Student'}</span>
            </div>
          </div>
        </>
      )}

      {guestPromptLabel && (
        <GuestLoginPrompt
          icon={<LogIn size={22} strokeWidth={2} />}
          title={`${guestPromptLabel} needs an account`}
          body={`Log in or create a free account to use ${guestPromptLabel}. It only takes a minute.`}
          onClose={() => setGuestPromptLabel(null)}
        />
      )}

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </aside>
    </>
  );
}

function ChatItem({ chat, active, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);

  function startEdit(e) {
    e.stopPropagation();
    setDraft(chat.title);
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== chat.title) onRename(chat.id, draft);
  }
  function handleKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { setEditing(false); setDraft(chat.title); }
  }

  if (editing) {
    return (
      <div className={`${styles.chatItem} ${active ? styles.chatItemActive : ''}`}>
        <input
          className={styles.renameInput}
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          onClick={e => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div
      className={`${styles.chatItem} ${active ? styles.chatItemActive : ''}`}
      onClick={() => onSelect(chat.id)}
    >
      <span className={styles.chatTitle}>{chat.title}</span>
      <div className={styles.chatActions}>
        <button className={styles.actionBtn} onClick={startEdit} title="Rename chat"><Pencil size={13} strokeWidth={2} /></button>
        <button
          className={styles.actionBtn}
          onClick={e => { e.stopPropagation(); onDelete(chat.id); }}
          title="Delete chat"
        ><X size={14} strokeWidth={2.2} /></button>
      </div>
    </div>
  );
}
