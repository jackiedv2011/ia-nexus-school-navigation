import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Sparkles, ClipboardList, Map, X, ArrowUp, ArrowUpLeft, LogIn, MailWarning } from 'lucide-react';
import MessageBubble from './MessageBubble';
import GuestLoginPrompt from './GuestLoginPrompt';
import styles from './ChatArea.module.css';
import { readStored, writeStored } from '../lib/storage';

const GUEST_BANNER_DISMISSED_KEY = 'ia_guest_banner_dismissed';

const SUGGESTIONS = [
  'Where is Mrs. Thornton during 1st period?',
  'Where is Mr. Hunter right now?',
  'Show me the bell schedule',
  'How do I get from room 188 to room 331?',
  "What is Singleton's full schedule?",
  'Who is in room 263 during 4th period?',
];

export default function ChatArea({ messages, onSend, sending, hasChat, mapOpen, onToggleMap, mode, onModeChange, onOpenSidebar, userName, onShowRoute, isGuest, onRate, emailVerified, onResendVerification }) {
  const [input, setInput] = useState('');
  const [showInteractiveModal, setShowInteractiveModal] = useState(false);
  const [resendState, setResendState] = useState('idle'); // 'idle' | 'sending' | 'sent'
  // Reappears each new browser session (sessionStorage clears on tab/browser
  // close) so returning guests are reminded, but it doesn't nag on every
  // in-app navigation within the same visit.
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(
    () => readStored(GUEST_BANNER_DISMISSED_KEY, { session: true }) === '1'
  );
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);

  function dismissGuestBanner() {
    writeStored(GUEST_BANNER_DISMISSED_KEY, '1', { session: true });
    setGuestBannerDismissed(true);
  }

  async function handleResend() {
    setResendState('sending');
    const ok = await onResendVerification();
    setResendState(ok ? 'sent' : 'idle');
  }

  function handleModeChange(next) {
    if (isGuest && next === 'interactive') {
      setShowInteractiveModal(true);
      return;
    }
    onModeChange(next);
  }

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages]);

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const val = input.trim();
    if (!val || sending) return;
    setInput('');
    onSend(val);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function useSuggestion(s) {
    setInput(s);
    textareaRef.current?.focus();
  }

  const isEmpty = messages.length === 0;

  // Defined once and rendered in two places: centered under the headline on the
  // empty state (Manus-style), pinned to the bottom once a conversation starts.
  const composer = (
    <div className={styles.inputBox}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        placeholder="Ask about a teacher, room, or directions…"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        rows={1}
        style={{ height: 'auto' }}
        onInput={e => {
          e.target.style.height = 'auto';
          e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
        }}
      />

      <div className={styles.composerBar}>
        {/* Mode chips live in the composer toolbar, the way Manus puts its
            build-type chip there — same radiogroup semantics as before. */}
        <div className={styles.modeToggle} role="radiogroup" aria-label="Assistant mode">
          <label className={`${styles.modeOption} ${mode === 'interactive' ? styles.modeActive : ''}`}>
            <input
              type="radio"
              name="chatMode"
              value="interactive"
              checked={mode === 'interactive'}
              onChange={() => handleModeChange('interactive')}
            />
            <Sparkles size={14} strokeWidth={2} /> <span className={styles.btnLabel}>Interactive</span>
          </label>
          <label className={`${styles.modeOption} ${mode === 'rule' ? styles.modeActive : ''}`}>
            <input
              type="radio"
              name="chatMode"
              value="rule"
              checked={mode === 'rule'}
              onChange={() => handleModeChange('rule')}
            />
            <ClipboardList size={14} strokeWidth={2} /> <span className={styles.btnLabel}>Rule Based</span>
          </label>
        </div>

        <button
          className={`${styles.sendBtn} ${(!input.trim() || sending) ? styles.sendBtnDisabled : ''}`}
          onClick={submit}
          disabled={!input.trim() || sending}
          title="Send"
        >
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );

  const disclaimer = (
    <p className={styles.disclaimer}>
      {mode === 'interactive'
        ? <><Sparkles size={12} strokeWidth={2} /> Interactive mode — powered by Claude AI</>
        : <><ClipboardList size={12} strokeWidth={2} /> Rule Based mode — using local schedule data</>}
    </p>
  );

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button className={styles.menuBtn} onClick={onOpenSidebar} aria-label="Open menu"><Menu size={20} strokeWidth={2} /></button>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.topPhoenix} />
          <div>
            <span className={styles.topTitle}>IA Nexus</span>
            <span className={styles.topSub}>School Navigation Assistant</span>
          </div>
        </div>

        <button
          className={`${styles.mapToggle} ${mapOpen ? styles.mapToggleActive : ''}`}
          onClick={onToggleMap}
          title={mapOpen ? 'Close map' : 'Open floor maps'}
        >
          {mapOpen
            ? <><X size={15} strokeWidth={2.2} /> <span className={styles.btnLabel}>Close Map</span></>
            : <><Map size={15} strokeWidth={2} /> <span className={styles.btnLabel}>Floor Maps</span></>}
        </button>
      </div>

      {isGuest && !guestBannerDismissed && (
        <div className={styles.guestBanner}>
          <span className={styles.guestBannerText}>
            You're browsing as a guest — log in to save your chat history across visits.
          </span>
          <Link to="/login" className={styles.guestBannerLink}>
            <LogIn size={13} strokeWidth={2} /> Log In
          </Link>
          <button className={styles.guestBannerClose} onClick={dismissGuestBanner} aria-label="Dismiss">
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {!isGuest && emailVerified === false && (
        <div className={styles.guestBanner}>
          <MailWarning size={15} strokeWidth={2} />
          <span className={styles.guestBannerText}>
            Please verify your email — check your inbox for the link we sent when you signed up.
          </span>
          <button className={styles.guestBannerLink} onClick={handleResend} disabled={resendState !== 'idle'}>
            {resendState === 'sent' ? 'Sent ✓' : resendState === 'sending' ? 'Sending…' : 'Resend Email'}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages} ref={messagesRef}>
        {isEmpty ? (
          <div className={styles.welcome}>
            <h2 className={styles.welcomeTitle}>
              {userName ? `Hi ${userName}, how can I help?` : 'How can I help you navigate?'}
            </h2>

            <div className={styles.composerWrap}>
              {composer}
              {disclaimer}
            </div>

            <p className={styles.exploreLabel}>Explore ideas</p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className={styles.suggestion} onClick={() => useSuggestion(s)}>
                  <span className={styles.suggestionText}>{s}</span>
                  <ArrowUpLeft size={14} strokeWidth={2} className={styles.suggestionArrow} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => <MessageBubble key={m.id || i} message={m} onShowRoute={onShowRoute} userName={userName} onRate={onRate} />)}
            {sending && (
              <div className={styles.typingWrap}>
                <div className={styles.typing}>
                  <span /><span /><span />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input — only pinned to the bottom once a conversation has started;
          on the empty state it sits centered under the headline instead. */}
      {!isEmpty && (
        <div className={styles.inputArea}>
          {composer}
          {disclaimer}
        </div>
      )}

      {showInteractiveModal && (
        <GuestLoginPrompt
          icon={<Sparkles size={22} strokeWidth={2} />}
          title="Interactive mode needs an account"
          body="Rule Based mode is open to everyone, no account needed. Log in or create a free account to unlock Interactive mode, powered by Claude AI."
          onClose={() => setShowInteractiveModal(false)}
        />
      )}
    </div>
  );
}
