import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const INDEX_HTML = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html');

// The theme is decided in TWO places, on purpose:
//   * public/theme-init.js — runs before the first paint, so a dark-mode user
//     never sees a white flash. It has to be a real file, not an inline
//     script, because this app's CSP is `script-src 'self'`.
//   * ThemeContext.jsx — owns the theme once React has mounted.
// If they ever disagree, the page visibly flips theme on load. These tests are
// what stop that.

describe('the pre-paint theme script', () => {
  const src = readFileSync(join(PUBLIC_DIR, 'theme-init.js'), 'utf8');

  it('is loaded synchronously in the document head', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    const tag = /<script[^>]*src="\/theme-init\.js"[^>]*>/.exec(html);
    expect(tag, 'index.html must load /theme-init.js').toBeTruthy();
    expect(tag[0], 'it must not be deferred, or it runs after the first paint').not.toMatch(/\bdefer\b|\basync\b/);
    expect(html.indexOf(tag[0]), 'it must come before the stylesheet').toBeLessThan(html.indexOf('fonts.css'));
  });

  it('is an external file, because the CSP forbids inline scripts', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    // No inline <script> with a body anywhere in the shell.
    const inline = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/.exec(html);
    expect(inline, `inline script found, which script-src 'self' will block: ${inline && inline[0].slice(0, 60)}`).toBeNull();
  });

  it('reads the same storage key and the same system preference as ThemeContext', () => {
    expect(src).toContain('ia_theme');
    expect(src).toContain('prefers-color-scheme: dark');
    expect(src).toContain('data-theme');
  });

  it('tolerates storage being blocked, and never throws', () => {
    // Executed for real, with localStorage rigged to throw the way Safari's
    // private mode does.
    const root = { attr: null, setAttribute(k, v) { if (k === 'data-theme') this.attr = v; } };
    const run = (localStorageImpl, matches) => {
      root.attr = null;
      const fn = new Function('window', 'document', src);
      fn(
        { matchMedia: () => ({ matches }), get localStorage() { return localStorageImpl(); } },
        { documentElement: root },
      );
      return root.attr;
    };
    const throwing = () => { throw new Error('SecurityError'); };
    expect(() => run(throwing, false)).not.toThrow();
    expect(run(throwing, false)).toBe('light');
    expect(run(throwing, true)).toBe('dark');
  });

  it('honours a saved theme over the system preference', () => {
    const root = { attr: null, setAttribute(k, v) { if (k === 'data-theme') this.attr = v; } };
    const run = (saved, systemDark) => {
      root.attr = null;
      const fn = new Function('window', 'document', src);
      fn(
        {
          matchMedia: () => ({ matches: systemDark }),
          localStorage: { getItem: () => saved },
        },
        { documentElement: root },
      );
      return root.attr;
    };
    expect(run('light', true)).toBe('light');    // saved wins
    expect(run('dark', false)).toBe('dark');     // saved wins
    expect(run(null, true)).toBe('dark');        // falls back to the system
    expect(run(null, false)).toBe('light');
    expect(run('nonsense', true)).toBe('dark');  // a junk value is ignored
  });
});

describe('getInitialTheme in ThemeContext', () => {
  let getInitialTheme;

  beforeEach(async () => {
    vi.resetModules();
    // ThemeContext does not export it, so exercise it through the module's
    // observable behaviour instead: importing and rendering is overkill here,
    // so read the source and check it agrees with the pre-paint script.
    getInitialTheme = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ThemeContext.jsx'), 'utf8');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('uses the same key and the same media query as the pre-paint script', () => {
    expect(getInitialTheme).toContain("'ia_theme'");
    expect(getInitialTheme).toContain('prefers-color-scheme: dark');
  });

  it('only accepts the two valid stored values', () => {
    expect(getInitialTheme).toMatch(/saved === 'dark' \|\| saved === 'light'/);
  });
});
