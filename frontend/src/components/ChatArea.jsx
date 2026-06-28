import { useState, useRef, useEffect } from 'react';
import { Menu, Sparkles, ClipboardList, Map, X, School, Send } from 'lucide-react';
import MessageBubble from './MessageBubble';
import styles from './ChatArea.module.css';

const SUGGESTIONS = [
  'Where is Mrs. Thornton during 1st period?',
  'Where is Mr. Hunter right now?',
  'Show me the bell schedule',
  'How do I get from room 188 to room 331?',
  "What is Singleton's full schedule?",
  'Who is in room 263 during 4th period?',
];

export default function ChatArea({ messages, onSend, sending, hasChat, mapOpen, onToggleMap, mode, onModeChange, onOpenSidebar, userName, onShowRoute }) {
  const [input, setInput] = useState('');
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);

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

        {/* Mode toggle */}
        <div className={styles.modeToggle} role="radiogroup" aria-label="Assistant mode">
          <label className={`${styles.modeOption} ${mode === 'interactive' ? styles.modeActive : ''}`}>
            <input
              type="radio"
              name="chatMode"
              value="interactive"
              checked={mode === 'interactive'}
              onChange={() => onModeChange('interactive')}
            />
            <Sparkles size={14} strokeWidth={2} /> <span className={styles.btnLabel}>Interactive</span>
          </label>
          <label className={`${styles.modeOption} ${mode === 'rule' ? styles.modeActive : ''}`}>
            <input
              type="radio"
              name="chatMode"
              value="rule"
              checked={mode === 'rule'}
              onChange={() => onModeChange('rule')}
            />
            <ClipboardList size={14} strokeWidth={2} /> <span className={styles.btnLabel}>Rule Based</span>
          </label>
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

      {/* Messages */}
      <div className={styles.messages} ref={messagesRef}>
        {isEmpty ? (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon}><School size={40} strokeWidth={1.6} /></div>
            <h2 className={styles.welcomeTitle}>
              {userName ? `Hi ${userName}, how can I help?` : 'How can I help you navigate?'}
            </h2>
            <p className={styles.welcomeSub}>
              Ask me about teacher locations, room directions, or the bell schedule.
            </p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className={styles.suggestion} onClick={() => useSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => <MessageBubble key={m.id || i} message={m} onShowRoute={onShowRoute} userName={userName} />)}
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

      {/* Input */}
      <div className={styles.inputArea}>
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
          <button
            className={`${styles.sendBtn} ${(!input.trim() || sending) ? styles.sendBtnDisabled : ''}`}
            onClick={submit}
            disabled={!input.trim() || sending}
            title="Send"
          >
            <Send size={18} strokeWidth={2.2} />
          </button>
        </div>
        <p className={styles.disclaimer}>
          {mode === 'interactive'
            ? <><Sparkles size={12} strokeWidth={2} /> Interactive mode — powered by Claude AI</>
            : <><ClipboardList size={12} strokeWidth={2} /> Rule Based mode — using local schedule data</>}
        </p>
      </div>
    </div>
  );
}
