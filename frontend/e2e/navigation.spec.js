import { test, expect } from './fixtures.js';

// Routing and the shape of the app, walked the way a careless user would.
test.describe('Navigation', () => {
  const publicRoutes = [
    ['/', 'How can I help you navigate?'],
    ['/home', 'IA Nexus'],
    ['/about', 'IA Nexus'],
    ['/pricing', 'IA Nexus'],
    ['/route', 'Find Your Route'],
    ['/login', 'Welcome back'],
    ['/signup', 'Create account'],
    ['/forgot-password', 'Forgot password?'],
  ];

  for (const [path, marker] of publicRoutes) {
    test(`${path} loads from a cold start`, async ({ page }) => {
      const failed = [];
      page.on('response', (r) => {
        if (r.status() >= 500) failed.push(`${r.status()} ${r.url()}`);
      });
      await page.goto(path);
      await expect(page.getByText(marker).first()).toBeVisible();
      expect(failed, failed.join(' | ')).toHaveLength(0);
    });
  }

  test('an unknown route redirects to the assistant, not a blank page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page).toHaveURL('http://localhost:5183/');
    await expect(page.getByText('How can I help you navigate?')).toBeVisible();
  });

  test('a page needing an account bounces a guest instead of erroring', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page).toHaveURL('http://localhost:5183/');
  });

  test('browser back and forward work across pages', async ({ page }) => {
    await page.goto('/');
    await page.goto('/route');
    await expect(page.getByRole('heading', { name: 'Find Your Route' })).toBeVisible();
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('How can I help you navigate?')).toBeVisible();
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Find Your Route' })).toBeVisible();
  });

  test('a found route survives a refresh by resetting cleanly, not half-drawn', async ({ page }) => {
    await page.goto('/route');
    await page.getByLabel('Starting Location — search rooms').click();
    await page.getByRole('option', { name: 'Room 188', exact: true }).click();
    await page.getByLabel('Destination — search rooms').click();
    await page.getByRole('option', { name: 'Room 192', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText('Route Found', { exact: true })).toBeVisible();

    await page.reload();
    // No stale route, and the saved/recent chips came back from storage.
    await expect(page.getByText('Route Found', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Recent')).toBeVisible();
  });

  test('the layout has no horizontal scroll at any common width', async ({ page }) => {
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/route');
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Third-party dependencies', () => {
  // The fixture already fails any off-origin request. This asserts the positive
  // side: the webfonts really do arrive, from this origin, and get applied — so
  // "no external requests" cannot be satisfied by simply not loading them.
  test('webfonts are served from this origin and actually applied', async ({ page }) => {
    const fontRequests = [];
    page.on('request', (r) => {
      if (/\.woff2?(\?|$)/.test(r.url())) fontRequests.push(r.url());
    });

    await page.goto('/home');
    const families = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...new Set([...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => f.family))].sort();
    });

    expect(families).toEqual(['Archivo Black', 'Inter', 'Playfair Display']);
    expect(fontRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) {
      expect(url, 'a font was fetched off-origin').toContain('localhost:5183/fonts/');
    }
  });
});
