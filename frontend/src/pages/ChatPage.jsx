import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Sidebar from '../components/Sidebar';
import ChatArea from '../components/ChatArea';
import MapPanel from '../components/MapPanel';
import RouteMapModal from '../components/RouteMapModal';
import Onboarding from '../components/Onboarding';
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const navigate = useNavigate();
  const isGuest = !localStorage.getItem('ia_token');
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mode, setMode] = useState(() => (isGuest ? 'rule' : (localStorage.getItem('ia_default_mode') || 'rule')));
  const [loadingChats, setLoadingChats] = useState(!isGuest);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState(localStorage.getItem('ia_name') || '');
  const userEmail = localStorage.getItem('ia_email') || '';
  const [emailVerified, setEmailVerified] = useState(true); // optimistic default — banner only appears once we know it's false
  // Monotonic counter for optimistic message keys so two messages created in the
  // same millisecond can't collide (L5).
  const tempIdRef = useRef(0);
  const nextTempId = () => `tmp-${++tempIdRef.current}`;
  // Inline route map shown when a user taps "Show on map" under a chat answer.
  const [routeModal, setRouteModal] = useState(null); // { loading, error, data, from, to }
  // First-run onboarding modal.
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Load chats on mount (guests have no account, so no chat history to load).
  useEffect(() => {
    if (isGuest) return;
    api.getChats()
      .then(setChats)
      .catch(() => {})
      .finally(() => setLoadingChats(false));
  }, [isGuest]);

  // Check email-verification status once per load — silently ignored on
  // failure (e.g. offline) since it's a non-critical banner, not a gate.
  useEffect(() => {
    if (isGuest) return;
    api.me().then(({ emailVerified }) => setEmailVerified(emailVerified)).catch(() => {});
  }, [isGuest]);

  async function handleResendVerification() {
    try {
      await api.resendVerification();
      return true;
    } catch {
      return false;
    }
  }

  // First-run detection: show onboarding only if it hasn't been completed and the
  // account has no schedule yet (returning users with a schedule never see it).
  // Guests have no account/schedule, so onboarding never applies to them.
  useEffect(() => {
    if (isGuest) return;
    if (localStorage.getItem('ia_onboarded') === '1') return;
    let alive = true;
    api.getSchedule()
      .then(({ schedule }) => {
        if (!alive) return;
        if (!schedule || Object.keys(schedule).length === 0) setShowOnboarding(true);
        else localStorage.setItem('ia_onboarded', '1');
      })
      .catch(() => {}); // offline — don't block; we'll try again next visit
    return () => { alive = false; };
  }, [isGuest]);

  // Load messages when active chat changes
  useEffect(() => {
    if (!activeChatId) { setMessages([]); return; }
    api.getMessages(activeChatId).then(setMessages).catch(() => {});
  }, [activeChatId]);

  async function handleNewChat() {
    // Guests have no persisted chats — just clear the local transcript.
    if (isGuest) { setActiveChatId(null); setMessages([]); return; }
    try {
      const chat = await api.createChat('New Chat');
      setChats(prev => [chat, ...prev]);
      setActiveChatId(chat.id);
      setMessages([]);
    } catch {}
  }

  async function handleGuestSend(content) {
    const now = new Date().toISOString();
    const userMsg = { id: nextTempId(), role: 'user', content, created_at: now };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    try {
      const history = messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
      const data = await api.guestMessage(content, history);
      const botMsg = { id: nextTempId(), role: 'assistant', content: data.response, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: nextTempId(),
        role: 'assistant',
        content: '⚠️ Connection error. Please make sure the backend is running.'
      }]);
    } finally {
      setSending(false);
    }
  }

  async function handleSend(content) {
    if (!content.trim() || sending) return;
    if (isGuest) return handleGuestSend(content);

    // Create a chat if none exists
    let chatId = activeChatId;
    if (!chatId) {
      try {
        const chat = await api.createChat('New Chat');
        setChats(prev => [chat, ...prev]);
        setActiveChatId(chat.id);
        chatId = chat.id;
      } catch { return; }
    }

    const now = new Date().toISOString();
    const userMsg = { id: nextTempId(), role: 'user', content, created_at: now };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const data = await api.sendMessage(chatId, content, mode);
      // Use the real DB id (not a temp client-side id) so thumbs up/down can
      // reference this message immediately, without waiting for a reload.
      const botMsg = { id: data.messageId ?? nextTempId(), role: 'assistant', content: data.response, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, botMsg]);

      // Update the sidebar entry locally from the response instead of refetching
      // the whole chat list, and move the active chat to the top (M8).
      setChats(prev => {
        const updatedAt = new Date().toISOString();
        const updated = prev.map(c =>
          c.id === chatId ? { ...c, title: data.title || c.title, updated_at: updatedAt } : c
        );
        const active = updated.find(c => c.id === chatId);
        if (!active) return updated;
        return [active, ...updated.filter(c => c.id !== chatId)];
      });
    } catch (e) {
      setMessages(prev => [...prev, {
        id: nextTempId(),
        role: 'assistant',
        content: '⚠️ Connection error. Please make sure the backend is running.'
      }]);
    } finally {
      setSending(false);
    }
  }

  // rating is 1, -1, or null (clear). Throws on failure so MessageBubble's
  // optimistic UI can revert.
  async function handleRateMessage(messageId, rating) {
    if (rating === null) {
      await api.clearMessageRating(activeChatId, messageId);
    } else {
      await api.rateMessage(activeChatId, messageId, rating);
    }
  }

  async function handleDeleteChat(id) {
    try {
      await api.deleteChat(id);
      setChats(prev => prev.filter(c => c.id !== id));
      if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
    } catch {}
  }

  function handleLogout() {
    localStorage.removeItem('ia_token');
    localStorage.removeItem('ia_email');
    localStorage.removeItem('ia_name');
    // "/" now stays on the same ChatPage instance instead of routing to a
    // different component, so component state (name, chats, messages) has to
    // be reset by hand — it would otherwise leak into the post-logout guest view.
    setUserName('');
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
    navigate('/');
  }

  async function handleClearAllChats() {
    await api.clearAllChats();
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
  }

  async function handleDeleteAccount() {
    await api.deleteAccount();
    localStorage.removeItem('ia_token');
    localStorage.removeItem('ia_email');
    localStorage.removeItem('ia_name');
    setUserName('');
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
    navigate('/');
  }

  async function handleRenameChat(id, title) {
    const clean = title.trim();
    if (!clean) return;
    await api.renameChat(id, clean);
    setChats(prev => prev.map(c => (c.id === id ? { ...c, title: clean } : c)));
  }

  async function handleUpdateName(name) {
    const res = await api.updateName(name);
    const newName = res.name || '';
    localStorage.setItem('ia_name', newName);
    setUserName(newName);
  }

  function handleDefaultModeChange(newMode) {
    setMode(newMode);
    localStorage.setItem('ia_default_mode', newMode);
  }

  function selectChat(id) {
    setActiveChatId(id);
  }

  async function handleShowRoute(fromRoom, toRoom) {
    const fromFloor = Math.floor(parseInt(fromRoom, 10) / 100);
    const toFloor = Math.floor(parseInt(toRoom, 10) / 100);
    setRouteModal({ loading: true, error: '', data: null, from: fromRoom, to: toRoom });
    try {
      const data = await api.findRoute({ fromRoom, fromFloor, toRoom, toFloor });
      setRouteModal({ loading: false, error: '', data, from: fromRoom, to: toRoom });
    } catch (e) {
      setRouteModal({ loading: false, error: e.message || 'Could not find that route.', data: null, from: fromRoom, to: toRoom });
    }
  }

  return (
    <div className={styles.root}>
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onSelectChat={selectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onLogout={handleLogout}
        userEmail={userEmail}
        userName={userName}
        loading={loadingChats}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onClearChats={handleClearAllChats}
        onDeleteAccount={handleDeleteAccount}
        onUpdateName={handleUpdateName}
        defaultMode={mode}
        onDefaultModeChange={handleDefaultModeChange}
        isGuest={isGuest}
      />

      <div className={`${styles.main} ${mapOpen ? styles.mainShift : ''}`}>
        <ChatArea
          messages={messages}
          onSend={handleSend}
          sending={sending}
          hasChat={!!activeChatId}
          mapOpen={mapOpen}
          onToggleMap={() => setMapOpen(o => !o)}
          mode={mode}
          onModeChange={setMode}
          onOpenSidebar={() => setSidebarOpen(true)}
          userName={userName}
          onShowRoute={handleShowRoute}
          isGuest={isGuest}
          onRate={isGuest ? undefined : handleRateMessage}
          emailVerified={emailVerified}
          onResendVerification={handleResendVerification}
        />
      </div>

      <MapPanel open={mapOpen} onClose={() => setMapOpen(false)} />

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

      {showOnboarding && (
        <Onboarding userName={userName} onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
