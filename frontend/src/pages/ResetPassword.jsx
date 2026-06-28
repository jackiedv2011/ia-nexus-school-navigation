import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api } from '../api';
import styles from './Auth.module.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const resetToken = location.state?.resetToken || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // No token means they skipped the verify step
  if (!resetToken) {
    return (
      <div className={styles.root}>
        <div className={styles.blob} />
        <div className={styles.card}>
          <Link to="/" className={styles.logoLink}>IA Nexus</Link>
          <h1 className={styles.heading}>Session Expired</h1>
          <p className={styles.sub}>Please start the password reset process again.</p>
          <p className={styles.switch}>
            <Link to="/forgot-password" className={styles.switchLink}>Reset password</Link>
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      await api.resetPassword(resetToken, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.root}>
        <div className={styles.blob} />
        <div className={styles.card}>
          <Link to="/" className={styles.logoLink}>IA Nexus</Link>
          <div className={styles.successIcon}><Check size={28} strokeWidth={2.4} /></div>
          <h1 className={styles.heading}>Password Reset!</h1>
          <p className={styles.sub}>Your password has been updated. You can now sign in.</p>
          <button className={styles.btn} onClick={() => navigate('/login')}>
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.blob} />
      <div className={styles.card}>
        <Link to="/" className={styles.logoLink}>IA Nexus</Link>
        <h1 className={styles.heading}>Set new password</h1>
        <p className={styles.sub}>Choose a password with at least 6 characters</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>New Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Confirm Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
