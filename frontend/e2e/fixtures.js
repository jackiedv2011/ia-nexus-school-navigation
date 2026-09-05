import { test as base, expect } from '@playwright/test';

// The app loads its webfonts from fonts.googleapis.com. That host is often
// unreachable from CI and from sandboxed environments, and a render-blocking
// stylesheet that never resolves makes every navigation wait for the browser's
// own timeout — which shows up as slow, flaky tests rather than as the real
// issue (see KI-13 in KNOWN-ISSUES.md, where it is tracked on its own merits).
//
// Fulfilling it with empty CSS keeps the tests fast and deterministic without
// pretending the network is something it isn't: the app's font stacks all fall
// back to system fonts, which is exactly what a student on a filtered school
// network would see.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://fonts.googleapis.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
    await use(page);
  },
});

export { expect };
