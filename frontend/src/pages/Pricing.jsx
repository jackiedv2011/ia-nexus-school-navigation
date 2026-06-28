import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import styles from './Info.module.css';

const INCLUDED = [
  'Real-time teacher locations',
  'Step-by-step floor navigation',
  'Live bell schedule & passing-period timer',
  'AI chat assistant',
  'Your personal class schedule',
  'Searchable teacher directory',
];

export default function Pricing() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.brandLogo} />
          <span className={styles.brandText}>IA Nexus</span>
        </Link>
        <nav className={styles.nav}>
          <Link to="/" className={styles.navLink}>Home</Link>
          <Link to="/about" className={styles.navLink}>About</Link>
          <Link to="/pricing" className={`${styles.navLink} ${styles.navLinkActive}`}>Pricing</Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className={styles.content}>
        <p className={styles.eyebrow}>Pricing</p>
        <h1 className={styles.title}>Free for the whole IA community</h1>
        <p className={styles.body} style={{ marginBottom: 32 }}>
          One plan. Every feature included. No subscriptions, no hidden fees, no premium tiers.
        </p>

        <div className={styles.priceCard}>
          <span className={styles.priceBadge}>For students &amp; staff</span>
          <div className={styles.priceAmount}>
            <span className={styles.priceCurrency}>$</span>0
            <span className={styles.pricePer}>/ forever</span>
          </div>
          <p className={styles.priceLede}>
            Built by an Innovation Academy student — free for everyone at IA, today and always.
          </p>

          <ul className={styles.priceList}>
            {INCLUDED.map((item) => (
              <li key={item} className={styles.priceItem}>
                <Check size={16} strokeWidth={2.4} className={styles.priceCheck} />
                {item}
              </li>
            ))}
          </ul>

          <Link to="/signup" className={styles.priceCta}>Get started — it's free</Link>
          <p className={styles.priceFoot}>No credit card required.</p>
        </div>
      </main>
    </div>
  );
}
