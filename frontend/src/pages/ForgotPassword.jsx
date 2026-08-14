import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';
import styles from './Auth.module.css';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      // Always advance — backend gives a generic response to prevent enumeration
      navigate('/verify-code', { state: { email: email.toLowerCase() } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.blob} />
      <Link to="/home" className={styles.exitBtn}><ArrowLeft size={15} strokeWidth={2.2} /> Home</Link>
      <div className={styles.card}>
        <Link to="/home" className={styles.logoLink}>IA Nexus</Link>
        <h1 className={styles.heading}>Forgot password?</h1>
        <p className={styles.sub}>Enter your email and we'll send you a 6-digit verification code</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              placeholder="you@school.edu"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Sending code…' : 'Send Verification Code'}
          </button>
        </form>

        <p className={styles.switch}>
          Remember your password?{' '}
          <Link to="/login" className={styles.switchLink}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
