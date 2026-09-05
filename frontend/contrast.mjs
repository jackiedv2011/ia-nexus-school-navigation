// Standalone contrast report against an already-running dev server.
//   npm run check:contrast          (all public pages, both themes)
//   PAGES=/route npm run check:contrast
// CI runs the same audit through e2e/contrast.spec.js, which starts its own
// servers; this script is for iterating locally.
import { chromium } from '@playwright/test';

import { AUDIT } from './e2e/contrast-audit.js';

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const pages = process.env.PAGES ? process.env.PAGES.split(',')
  : ['/home', '/', '/route', '/login', '/about', '/pricing', '/signup', '/forgot-password', '/admin'];
let total = 0;
for (const theme of ['light', 'dark']) {
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('ia_theme', t); } catch { /* blocked */ } }, theme);
  console.log(`\n### ${theme.toUpperCase()} MODE`);
  for (const p of pages) {
    await page.goto('http://localhost:5183' + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const fails = await page.evaluate(AUDIT);
    const uniq = [...new Map(fails.map((f) => [f.cls + f.color + f.bg, f])).values()];
    total += uniq.length;
    console.log(`  ${p.padEnd(10)} ${uniq.length ? `${uniq.length} distinct failures` : 'clean'}`);
    for (const f of uniq.slice(0, 8)) {
      console.log(`      ${String(f.ratio).padStart(5)}:1 (needs ${f.need})  ${f.color} on ${f.bg}  ${f.size}px/${f.weight}  .${f.cls}  "${f.text}"`);
    }
  }
  await ctx.close();
}
console.log(`\nTOTAL distinct contrast failures: ${total}`);
await b.close();
// Non-zero exit so this can gate CI.
process.exit(total === 0 ? 0 : 1);
