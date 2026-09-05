import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Check, X, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import styles from './Auth.module.css';
import { readStored } from '../lib/storage';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('This verification link is missing its token.');
      return;
    }
    api.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(err => {
        setStatus('error');
        setError(err.message || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  const isLoggedIn = !!readStored('ia_token');

  return (
    <div className={styles.root}>
      <div className={styles.blob} />
      <Link to="/home" className={styles.exitBtn}><ArrowLeft size={15} strokeWidth={2.2} /> Home</Link>
      <div className={styles.card}>
        <Link to="/home" className={styles.logoLink}>IA Nexus</Link>

        {status === 'loading' && (
          <>
            <h1 className={styles.heading}>Verifying…</h1>
            <p className={styles.sub}>One moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className={styles.successIcon}><Check size={28} strokeWidth={2.4} /></div>
            <h1 className={styles.heading}>Email Verified!</h1>
            <p className={styles.sub}>Your email address is confirmed.</p>
            <button className={styles.btn} onClick={() => window.location.assign(isLoggedIn ? '/' : '/login')}>
              {isLoggedIn ? 'Continue to IA Nexus' : 'Go to Sign In'}
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className={styles.error} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <X size={16} strokeWidth={2.4} /> {error}
            </div>
            <p className={styles.sub} style={{ marginTop: 12 }}>
              You can request a new link from Settings once you're signed in.
            </p>
            <button className={styles.btn} onClick={() => window.location.assign(isLoggedIn ? '/' : '/login')}>
              {isLoggedIn ? 'Continue to IA Nexus' : 'Go to Sign In'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
