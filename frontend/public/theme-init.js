/* Applies the saved (or system) theme BEFORE the first paint.
 *
 * Without this, the whole page renders light and then flips once React mounts —
 * a white flash in a dark room, which is exactly when someone is most likely to
 * be using dark mode. The usual fix is an inline <script> in the head, but this
 * app's own CSP is `script-src 'self'`, which blocks inline scripts. So it is a
 * real file, loaded synchronously (no defer/async), and it is deliberately tiny.
 *
 * This must stay in sync with getInitialTheme() in src/theme/ThemeContext.jsx —
 * frontend/src/theme/ThemeContext.test.js asserts that it does.
 */
(function () {
  try {
    var saved = null;
    try { saved = window.localStorage.getItem('ia_theme'); } catch (e) { /* storage blocked */ }
    // ?theme=dark|light wins: the IA phone app embeds the Route Finder and
    // passes its own mode so the screen matches the rest of the app.
    try {
      var forced = new URLSearchParams(window.location.search).get('theme');
      if (forced === 'dark' || forced === 'light') saved = forced;
    } catch (e) { /* URLSearchParams unavailable */ }
    var theme = saved === 'dark' || saved === 'light'
      ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
