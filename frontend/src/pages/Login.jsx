import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import styles from './Auth.module.css';
import { readStored, writeStored } from '../lib/storage';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hpField, setHpField] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(email, password, hpField);
      // The token is the one value that actually matters. If storage refuses
      // it the user is signed in for this page load only, so say so rather
      // than letting them discover it on the next navigation.
      if (!writeStored('ia_token', data.token)) {
        setError('Your browser is blocking site storage, so we can\u2019t keep you signed in. '
               + 'Enable cookies/site data for this site and try again.');
        return;
      }
      writeStored('ia_email', data.email);
      writeStored('ia_name', data.name || '');
      // First login ever on this device lands on Home; every login after that
      // goes straight to the chatbot page (the site's normal landing spot).
      const isFirstLogin = !readStored('ia_has_logged_in_before');
      writeStored('ia_has_logged_in_before', '1');
      navigate(isFirstLogin ? '/home' : '/');
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
      <div className={styles.themeToggleWrap}><ThemeToggle /></div>
      <div className={styles.card}>
        <Link to="/home" className={styles.logoLink}>IA Nexus</Link>
        <h1 className={styles.heading}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your account</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.hp} aria-hidden="true">
            <label htmlFor="login-hp">Leave blank</label>
            <input id="login-hp" type="text" tabIndex={-1} autoComplete="off" hidden value={hpField} onChange={e => setHpField(e.target.value)} />
          </div>
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
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className={styles.switch} style={{ marginBottom: '8px' }}>
          <Link to="/forgot-password" className={styles.switchLink}>Forgot password?</Link>
        </p>

        <p className={styles.switch}>
          Don't have an account?{' '}
          <Link to="/signup" className={styles.switchLink}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
