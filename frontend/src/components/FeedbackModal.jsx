import { useState } from 'react';
import { X, Star, Check } from 'lucide-react';
import { api } from '../api';
import styles from './FeedbackModal.module.css';
import { useModal } from '../lib/useModal';

const MAX_COMMENT_LEN = 600; // "max a paragraph"

export default function FeedbackModal({ onClose }) {
  const ref = useModal(onClose);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [hpField, setHpField] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) { setError('Please choose a star rating.'); return; }
    setError('');
    setSubmitting(true);
    try {
      await api.submitFeedback(rating, comment.trim(), hpField);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div ref={ref} tabIndex={-1} className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share feedback">
        <button className={styles.close} onClick={onClose} aria-label="Close"><X size={18} strokeWidth={2} /></button>

        {done ? (
          <div className={styles.doneWrap}>
            <div className={styles.doneIcon}><Check size={24} strokeWidth={2.4} /></div>
            <h2 className={styles.title}>Thanks for the feedback!</h2>
            <p className={styles.sub}>It genuinely helps us improve IA Nexus.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.hp} aria-hidden="true">
              <label htmlFor="feedback-hp">Leave blank</label>
              <input id="feedback-hp" type="text" tabIndex={-1} autoComplete="off" hidden value={hpField} onChange={e => setHpField(e.target.value)} />
            </div>
            <h2 className={styles.title}>How's your experience?</h2>
            <p className={styles.sub}>Rate IA Nexus and tell us what's working or what isn't.</p>

            <div className={styles.stars} role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  className={styles.starBtn}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  aria-pressed={rating === n}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                >
                  <Star
                    size={28}
                    strokeWidth={1.8}
                    fill={(hoverRating || rating) >= n ? 'currentColor' : 'none'}
                    className={(hoverRating || rating) >= n ? styles.starFilled : styles.starEmpty}
                  />
                </button>
              ))}
            </div>

            <textarea
              className={styles.textarea}
              placeholder="What's working well, or what should we fix? (optional)"
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, MAX_COMMENT_LEN))}
              rows={4}
            />
            <p className={styles.charCount}>{comment.length}/{MAX_COMMENT_LEN}</p>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <button className={styles.submitBtn} type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
