import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import styles from './Auth.module.css';

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hpField, setHpField] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      await api.signup(email, password, name, hpField);
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
        <Link to="/home" className={styles.exitBtn}><ArrowLeft size={15} strokeWidth={2.2} /> Home</Link>
        <div className={styles.themeToggleWrap}><ThemeToggle /></div>
        <div className={styles.card}>
          <Link to="/home" className={styles.logoLink}>IA Nexus</Link>
          <div className={styles.successIcon}><Check size={28} strokeWidth={2.4} /></div>
          <h1 className={styles.heading}>Account Created!</h1>
          <p className={styles.sub}>Your account has been created successfully.</p>
          <button className={styles.btn} onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.blob} />
      <div className={styles.themeToggleWrap}><ThemeToggle /></div>
      <div className={styles.card}>
        <Link to="/home" className={styles.logoLink}>IA Nexus</Link>
        <h1 className={styles.heading}>Create account</h1>
        <p className={styles.sub}>Get started with IA Nexus</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.hp} aria-hidden="true">
            <label htmlFor="signup-hp">Leave blank</label>
            <input id="signup-hp" type="text" tabIndex={-1} autoComplete="off" hidden value={hpField} onChange={e => setHpField(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
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
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
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
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className={styles.switch}>
          Already have an account?{' '}
          <Link to="/login" className={styles.switchLink}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
