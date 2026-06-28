import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../api';
import styles from './Auth.module.css';

export default function VerifyCode() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  // If the user landed here without going through the email step, send them back
  useEffect(() => {
    if (!email) navigate('/forgot-password', { replace: true });
  }, [email, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (code.length !== 6) return setError('Enter the 6-digit code');
    setLoading(true);
    try {
      const data = await api.verifyCode(email, code);
      navigate('/reset-password', { state: { resetToken: data.resetToken } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setResending(true);
    setResent(false);
    try {
      await api.forgotPassword(email);
      setResent(true);
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.blob} />
      <div className={styles.card}>
        <Link to="/" className={styles.logoLink}>IA Nexus</Link>
        <h1 className={styles.heading}>Enter code</h1>
        <p className={styles.sub}>
          We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
        </p>

        {error && <div className={styles.error}>{error}</div>}
        {resent && !error && (
          <div className={styles.success}>A new code has been sent.</div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Verification Code</label>
            <input
              className={`${styles.input} ${styles.codeInput}`}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
            />
          </div>
          <button className={styles.btn} type="submit" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying…' : 'Verify Code'}
          </button>
        </form>

        <p className={styles.switch}>
          Didn't get it?{' '}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? 'Resending…' : 'Resend code'}
          </button>
        </p>
        <p className={styles.switch}>
          <Link to="/login" className={styles.switchLink}>Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
