import { createContext, useContext, useEffect, useState } from 'react';
import { readStored, writeStored } from '../lib/storage';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

// ThemeProvider wraps the entire app and sits OUTSIDE the ErrorBoundary, so an
// exception in here is a blank white page with no way back. localStorage does
// throw in real browsers — Safari private mode, "block all cookies", some
// embedded webviews — so every access has to be able to fail harmlessly.
function getInitialTheme() {
  const saved = readStored('ia_theme');
  if (saved === 'dark' || saved === 'light') return saved;
  // Fall back to the OS preference the first time
  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch { /* matchMedia unavailable — fall through to light */ }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStored('ia_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
