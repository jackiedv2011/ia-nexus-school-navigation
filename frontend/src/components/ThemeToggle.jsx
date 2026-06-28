import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      className={`${styles.toggle} ${className}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <span className={styles.icon}>
        {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
      </span>
    </button>
  );
}
