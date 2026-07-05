import { useState, useEffect } from 'react';
import { Check, ChevronRight, Sparkles, ClipboardList, X } from 'lucide-react';
import { api } from '../api';
import ThemeToggle from './ThemeToggle';
import styles from './SettingsModal.module.css';

export default function SettingsModal({
  open, onClose, userEmail, userName, onUpdateName,
  onLogout, onClearChats, onDeleteAccount,
  defaultMode, onDefaultModeChange,
}) {
  // Profile name
  const [nameDraft, setNameDraft] = useState(userName || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  // Change-password form
  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState(null);   // { type: 'error'|'success', text }
  const [pwLoading, setPwLoading] = useState(false);

  // Destructive confirmations
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Close on Escape, and lock background scroll while open
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function close() {
    // reset transient UI when closing
    setPwOpen(false); setCurrent(''); setNext(''); setConfirm(''); setPwMsg(null);
    setConfirmClear(false); setConfirmDelete(false);
    onClose();
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (next !== confirm) { setPwMsg({ type: 'error', text: 'New passwords do not match' }); return; }
    if (next.length < 8) { setPwMsg({ type: 'error', text: 'New password must be at least 8 characters' }); return; }
    setPwLoading(true);
    try {
      const res = await api.changePassword(current, next);
      // The server rotates the session token on password change (revoking other
      // sessions); persist the refreshed token so this tab stays signed in.
      if (res && res.token) localStorage.setItem('ia_token', res.token);
      setPwMsg({ type: 'success', text: 'Password updated' });
      setCurrent(''); setNext(''); setConfirm('');
      setTimeout(() => { setPwOpen(false); setPwMsg(null); }, 1400);
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message });
    } finally {
      setPwLoading(false);
    }
  }

  async function handleSaveName() {
    setNameSaving(true);
    setNameSaved(false);
    try {
      await onUpdateName(nameDraft.trim());
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 1400);
    } finally {
      setNameSaving(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try { await onClearChats(); setConfirmClear(false); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true);
    try { await onDeleteAccount(); }
    finally { setBusy(false); }
  }

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeBtn} onClick={close} aria-label="Close settings"><X size={18} strokeWidth={2} /></button>
        </div>

        <div className={styles.body}>
          {/* ── Profile ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Profile</p>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>Display name</span>
                <span className={styles.rowSub}>How we greet you in the app</span>
              </div>
            </div>
            <div className={styles.pwForm} style={{ borderTop: 'none', paddingTop: 0, marginTop: 8 }}>
              <input
                className={styles.pwInput}
                type="text"
                placeholder="Your name"
                value={nameDraft}
                maxLength={60}
                onChange={e => setNameDraft(e.target.value)}
              />
              <div className={styles.pwActions}>
                {nameSaved && <span className={styles.msgSuccess} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} strokeWidth={2.4} /> Saved</span>}
                <button
                  className={styles.primaryBtn}
                  onClick={handleSaveName}
                  disabled={nameSaving || nameDraft.trim() === (userName || '')}
                >
                  {nameSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Appearance ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Appearance</p>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>Dark mode</span>
                <span className={styles.rowSub}>Switch between light and dark themes</span>
              </div>
              <ThemeToggle />
            </div>
          </div>

          {/* ── Chat preferences ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Chat</p>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>Default mode</span>
                <span className={styles.rowSub}>Which assistant new chats start in</span>
              </div>
              <div className={styles.segmented}>
                <button
                  className={`${styles.segBtn} ${defaultMode === 'rule' ? styles.segActive : ''}`}
                  onClick={() => onDefaultModeChange('rule')}
                ><ClipboardList size={13} strokeWidth={2} /> Rule</button>
                <button
                  className={`${styles.segBtn} ${defaultMode === 'interactive' ? styles.segActive : ''}`}
                  onClick={() => onDefaultModeChange('interactive')}
                ><Sparkles size={13} strokeWidth={2} /> AI</button>
              </div>
            </div>
          </div>

          {/* ── Account ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Account</p>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>Signed in as</span>
                <span className={styles.rowSub}>{userEmail || '—'}</span>
              </div>
            </div>

            {/* Change password */}
            {!pwOpen ? (
              <button className={styles.linkRow} onClick={() => setPwOpen(true)}>
                <span className={styles.rowTitle}>Change password</span>
                <span className={styles.chev}><ChevronRight size={16} strokeWidth={2} /></span>
              </button>
            ) : (
              <form className={styles.pwForm} onSubmit={handleChangePassword}>
                {pwMsg && (
                  <div className={pwMsg.type === 'error' ? styles.msgError : styles.msgSuccess}>
                    {pwMsg.text}
                  </div>
                )}
                <input
                  className={styles.pwInput}
                  type="password"
                  placeholder="Current password"
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  required
                  autoFocus
                />
                <input
                  className={styles.pwInput}
                  type="password"
                  placeholder="New password (min. 8 chars)"
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  required
                />
                <input
                  className={styles.pwInput}
                  type="password"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
                <div className={styles.pwActions}>
                  <button type="button" className={styles.ghostBtn} onClick={() => { setPwOpen(false); setPwMsg(null); }}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.primaryBtn} disabled={pwLoading}>
                    {pwLoading ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ── Data & danger zone ── */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Data</p>

            {/* Clear all chats */}
            {!confirmClear ? (
              <button className={styles.linkRow} onClick={() => setConfirmClear(true)}>
                <span className={styles.rowTitle}>Clear all conversations</span>
                <span className={styles.chev}><ChevronRight size={16} strokeWidth={2} /></span>
              </button>
            ) : (
              <div className={styles.confirmBox}>
                <p className={styles.confirmText}>Delete every conversation? This can't be undone.</p>
                <div className={styles.pwActions}>
                  <button className={styles.ghostBtn} onClick={() => setConfirmClear(false)} disabled={busy}>Cancel</button>
                  <button className={styles.dangerBtn} onClick={handleClear} disabled={busy}>
                    {busy ? 'Clearing…' : 'Clear all'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <p className={`${styles.sectionLabel} ${styles.danger}`}>Danger zone</p>

            <button className={styles.linkRow} onClick={onLogout}>
              <span className={styles.rowTitle}>Sign out</span>
              <span className={styles.chev}><ChevronRight size={16} strokeWidth={2} /></span>
            </button>

            {!confirmDelete ? (
              <button className={`${styles.linkRow} ${styles.dangerRow}`} onClick={() => setConfirmDelete(true)}>
                <span className={styles.rowTitle}>Delete account</span>
                <span className={styles.chev}><ChevronRight size={16} strokeWidth={2} /></span>
              </button>
            ) : (
              <div className={styles.confirmBox}>
                <p className={styles.confirmText}>
                  Permanently delete your account and all data? This <strong>cannot</strong> be undone.
                </p>
                <div className={styles.pwActions}>
                  <button className={styles.ghostBtn} onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</button>
                  <button className={styles.dangerBtn} onClick={handleDelete} disabled={busy}>
                    {busy ? 'Deleting…' : 'Delete forever'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className={styles.version}>IA Nexus · v1.0</p>
        </div>
      </div>
    </div>
  );
}
