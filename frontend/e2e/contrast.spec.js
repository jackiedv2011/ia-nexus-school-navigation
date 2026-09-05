import { test, expect } from './fixtures.js';
import { AUDIT } from './contrast-audit.js';

// Colour is not decoration here: a student reading this in a corridor, on a
// phone, at arm's length, in whatever light the hallway has. Every text node on
// every public page is measured against the background it is actually painted
// on, in both themes, against WCAG AA.
//
// This caught 39 real failures when it was first written — including every
// primary button in dark mode, which was near-black text on red at 2.7:1
// because `--white` flips to a dark colour in dark mode and the buttons used it
// as their text colour.

const PAGES = [
  ['/home', 'the landing page'],
  ['/', 'the assistant'],
  ['/route', 'the route finder'],
  ['/schedule', 'my schedule (guests are redirected to the assistant)'],
  ['/login', 'sign in'],
  ['/signup', 'sign up'],
  ['/forgot-password', 'forgot password'],
  ['/about', 'about'],
  ['/pricing', 'pricing'],
  ['/admin', 'the admin key prompt'],
];

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} theme`, () => {
    for (const [path, name] of PAGES) {
      test(`${name} meets WCAG AA`, async ({ page }) => {
        await page.addInitScript((t) => {
          try { localStorage.setItem('ia_theme', t); } catch { /* storage blocked */ }
        }, theme);
        await page.goto(path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(200);   // let the theme attribute settle

        const failures = await page.evaluate(AUDIT);
        // One line per distinct colour-on-colour pair, so a failure message is
        // something a person can act on rather than a wall of duplicates.
        const distinct = [...new Map(failures.map((f) => [f.cls + f.color + f.bg, f])).values()];
        const report = distinct
          .map((f) => `  ${f.ratio}:1 (needs ${f.need})  ${f.color} on ${f.bg}  ${f.size}px/${f.weight}  .${f.cls}  "${f.text}"`)
          .join('\n');
        expect(distinct, `contrast failures on ${path} in ${theme} mode:\n${report}`).toEqual([]);
      });
    }
  });
}
