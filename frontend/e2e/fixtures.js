import { test as base, expect } from '@playwright/test';

// The app is expected to load NOTHING from a third party — the webfonts are
// self-hosted (frontend/public/fonts/) precisely so a CDN cannot sit on the
// critical path. This fixture fails any request that leaves the origin, so a
// hotlinked asset creeping back in breaks a test instead of quietly making the
// app depend on someone else's uptime and on a school network not filtering it.
//
// A test that genuinely needs an external request can opt out with
// test.use({ allowExternalRequests: true }).
export const test = base.extend({
  allowExternalRequests: [false, { option: true }],

  page: async ({ page, allowExternalRequests }, use) => {
    const external = [];
    if (!allowExternalRequests) {
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (/^https?:\/\/localhost:5183\//.test(url) || /^(data|blob):/.test(url)) {
          return route.continue();
        }
        external.push(url);
        return route.abort();
      });
    }
    await use(page);
    expect(external, 'the app requested something off-origin').toEqual([]);
  },
});

export { expect };
