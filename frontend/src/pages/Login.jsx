import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import styles from './Auth.module.css';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(email, password);
      localStorage.setItem('ia_token', data.token);
      localStorage.setItem('ia_email', data.email);
      localStorage.setItem('ia_name', data.name || '');
      navigate('/app');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.blob} />
      <div className={styles.themeToggleWrap}><ThemeToggle /></div>
      <div className={styles.card}>
        <Link to="/" className={styles.logoLink}>IA Nexus</Link>
        <h1 className={styles.heading}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your account</p>

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
