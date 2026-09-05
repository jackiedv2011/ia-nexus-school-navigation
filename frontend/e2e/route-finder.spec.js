import { test, expect } from './fixtures.js';

// The flagship feature, walked as a student would.
test.describe('Route Finder', () => {
  test('finds a same-floor route and draws it', async ({ page }) => {
    // Only the app's own errors matter here. Third-party asset loads (the
    // Google Fonts stylesheet) can fail on a restricted network without that
    // being a defect — every font stack in index.css has a system fallback.
    const errors = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/fonts\.(googleapis|gstatic)\.com|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED/.test(m.text())) return;
      errors.push(m.text());
    });

    await page.goto('/route');
    await expect(page.getByRole('heading', { name: 'Find Your Route' })).toBeVisible();

    await page.getByLabel('Starting Location — search rooms').click();
    await page.getByRole('option', { name: 'Room 188', exact: true }).click();
    await page.getByLabel('Destination — search rooms').click();
    await page.getByRole('option', { name: 'Room 192', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();

    await expect(page.getByText('Route Found', { exact: true })).toBeVisible();
    await expect(page.getByText('Both locations are on Floor 1')).toBeVisible();
    // The distance and time must be real numbers, not "~0 m" over a blank map.
    await expect(page.getByText(/~\d+ m$/)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('finds a cross-floor route and shows both legs plus the stairwell', async ({ page }) => {
    await page.goto('/route');
    await page.getByLabel('Starting Location — search rooms').fill('188');
    await page.getByRole('option', { name: 'Room 188', exact: true }).click();

    // Both pickers have their own Floor 1/2/3 tabs; index 1 is the destination's.
    await page.getByRole('button', { name: 'Floor 3' }).nth(1).click();
    await page.getByLabel('Destination — search rooms').fill('331');
    await page.getByRole('option', { name: 'Room 331', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();

    await expect(page.getByText('Floors 1 → 3 — use the stairwell')).toBeVisible();
    await expect(page.getByText(/^Stair \d+$/)).toBeVisible();
    // One canvas per floor.
    await expect(page.locator('canvas')).toHaveCount(2);
  });

  test('refuses to route a location to itself', async ({ page }) => {
    await page.goto('/route');
    await page.getByLabel('Starting Location — search rooms').click();
    await page.getByRole('option', { name: 'Room 188', exact: true }).click();
    await page.getByLabel('Destination — search rooms').click();
    await page.getByRole('option', { name: 'Room 188', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText('Starting location and destination cannot be the same.')).toBeVisible();
    await expect(page.getByText('Route Found', { exact: true })).toHaveCount(0);
  });

  test('asks for both fields before searching', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText('Please select both a starting location and a destination.')).toBeVisible();
  });

  // The failure mode the audit found: a 404 from the API used to render as
  // "Route Found" over an empty map.
  test('shows a real error when the server cannot route the pair', async ({ page }) => {
    await page.route('**/api/route', r =>
      r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No route found between Room 188 and Room 192.' }) }));
    await page.goto('/route');
    await page.getByLabel('Starting Location — search rooms').click();
    await page.getByRole('option', { name: 'Room 188', exact: true }).click();
    await page.getByLabel('Destination — search rooms').click();
    await page.getByRole('option', { name: 'Room 192', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();

    await expect(page.getByText(/No route found/)).toBeVisible();
    await expect(page.getByText('Route Found', { exact: true })).toHaveCount(0);
  });

  test('reports the backend being unreachable instead of failing silently', async ({ page }) => {
    await page.route('**/api/route', r => r.abort());
    await page.goto('/route');
    await page.getByLabel('Starting Location — search rooms').click();
    await page.getByRole('option', { name: 'Room 188', exact: true }).click();
    await page.getByLabel('Destination — search rooms').click();
    await page.getByRole('option', { name: 'Room 192', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.locator('p').filter({ hasText: /Unable to connect|Failed|error/i }).first()).toBeVisible();
    await expect(page.getByText('Route Found', { exact: true })).toHaveCount(0);
  });

  test('is usable with the keyboard alone', async ({ page }) => {
    await page.goto('/route');
    const start = page.getByLabel('Starting Location — search rooms');
    await start.focus();
    await start.press('ArrowDown');
    await start.press('ArrowDown');
    await start.press('Enter');
    await expect(start).not.toHaveValue('');
  });
});
