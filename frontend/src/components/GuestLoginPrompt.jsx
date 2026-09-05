import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import styles from './GuestLoginPrompt.module.css';
import { useModal } from '../lib/useModal';

// Generic "this needs an account" modal shown to guests (not signed in) when
// they try to use something that requires a login — Interactive mode, or a
// protected page like Route Finder / My Schedule / Teachers.
export default function GuestLoginPrompt({ icon, title, body, onClose }) {
  const ref = useModal(onClose);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div ref={ref} tabIndex={-1} className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <button className={styles.close} onClick={onClose} aria-label="Close"><X size={18} strokeWidth={2} /></button>
        <div className={styles.icon} aria-hidden="true">{icon}</div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          <Link to="/login" className={styles.primary}>Log In</Link>
          <Link to="/signup" className={styles.secondary}>Sign Up</Link>
        </div>
      </div>
    </div>
  );
}
