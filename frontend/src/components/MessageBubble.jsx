import { useState } from 'react';
import { Map, Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import styles from './MessageBubble.module.css';

// Detect a navigable "Room A → Room B" route in an assistant message so we can
// offer a "Show on map" button. Best-effort: only triggers when two distinct
// 3-digit rooms on floors 1–3 appear in a directions-style reply.
export function detectRoute(text) {
  const m = text.match(/Room\s*(\d{3})\b[\s\S]*?(?:→|->|to)\s*Room\s*(\d{3})\b/i);
  if (!m) return null;
  const from = m[1], to = m[2];
  if (from === to) return null;
  const fromFloor = Math.floor(parseInt(from, 10) / 100);
  const toFloor = Math.floor(parseInt(to, 10) / 100);
  if (fromFloor < 1 || fromFloor > 3 || toFloor < 1 || toFloor > 3) return null;
  return { from, to };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatText(text) {
  return text
    .split('\n')
    .map(line => {
      return escapeHtml(line)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
    })
    .join('<br/>');
}

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, onShowRoute, userName, onRate }) {
  const isUser = message.role === 'user';
  const time = formatTime(message.created_at);
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(message.my_rating ?? null);
  const route = !isUser && onShowRoute ? detectRoute(message.content) : null;
  const userInitial = (userName || 'U').trim().charAt(0).toUpperCase() || 'U';

  function handleCopy() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  // Clicking the active thumb again clears the rating; clicking the other
  // one switches it. Optimistic — reverts if the request fails.
  async function handleRate(value) {
    const prev = rating;
    const next = prev === value ? null : value;
    setRating(next);
    try {
      await onRate(message.id, next);
    } catch {
      setRating(prev);
    }
  }

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : styles.rowBot}`}>
      {!isUser && (
        <div className={styles.botAvatar}>
          <img src="/phoenix.png" alt="IA Nexus" className={styles.botAvatarImg} />
        </div>
      )}
      <div className={styles.bubbleCol}>
        <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleBot}`}>
          {isUser ? (
            <p className={styles.text}>{message.content}</p>
          ) : (
            <p
              className={styles.text}
              dangerouslySetInnerHTML={{ __html: formatText(message.content) }}
            />
          )}
        </div>
        {route && (
          <button
            className={styles.showMapBtn}
            onClick={() => onShowRoute(route.from, route.to)}
          >
            <Map size={14} strokeWidth={2} /> Show on map · {route.from} → {route.to}
          </button>
        )}
        {(time || !isUser) && (
          <div className={`${styles.meta} ${isUser ? styles.metaUser : ''}`}>
            {time && <span className={styles.timestamp}>{time}</span>}
            {!isUser && (
              <button className={styles.copyBtn} onClick={handleCopy} title="Copy message">
                {copied
                  ? <><Check size={12} strokeWidth={2.4} /> Copied</>
                  : <><Copy size={12} strokeWidth={2} /> Copy</>}
              </button>
            )}
            {!isUser && onRate && (
              <div className={styles.rateRow}>
                <button
                  className={`${styles.rateBtn} ${rating === 1 ? styles.rateBtnActiveUp : ''}`}
                  onClick={() => handleRate(1)}
                  title="Good response"
                  aria-pressed={rating === 1}
                >
                  <ThumbsUp size={13} strokeWidth={2} />
                </button>
                <button
                  className={`${styles.rateBtn} ${rating === -1 ? styles.rateBtnActiveDown : ''}`}
                  onClick={() => handleRate(-1)}
                  title="Poor response"
                  aria-pressed={rating === -1}
                >
                  <ThumbsDown size={13} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {isUser && <div className={styles.userAvatar}><span>{userInitial}</span></div>}
    </div>
  );
}
