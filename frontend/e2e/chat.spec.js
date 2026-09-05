import { test, expect } from '@playwright/test';

// The guest chat, which is the app's front door — no account needed.
test.describe('Guest chat', () => {
  test('answers a question and draws the route map under the answer', async ({ page }) => {
    await page.goto('/');
    const box = page.getByPlaceholder('Ask about a teacher, room, or directions…');
    await box.fill('How do I get from room 188 to room 331?');
    await box.press('Enter');

    // The answer states the facts the pathfinder computed...
    await expect(page.getByText('Floor 1 (Engineering & Manufacturing Wing)')).toBeVisible();
    await expect(page.getByText(/Stairwell:\s*Stair \d+/)).toBeVisible();
    await expect(page.getByText(/Walk:\s*about \d+ min/)).toBeVisible();

    // ...and the map IS the directions, drawn inline rather than behind a button.
    await expect(page.getByRole('button', { name: /Route · Room 188 → Room 331/ })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(2, { timeout: 10_000 });
  });

  test('the inline map collapses and reopens', async ({ page }) => {
    await page.goto('/');
    const box = page.getByPlaceholder('Ask about a teacher, room, or directions…');
    await box.fill('How do I get from room 188 to room 192?');
    await box.press('Enter');

    const toggle = page.getByRole('button', { name: /Route · Room 188 → Room 192/ });
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 10_000 });
    await toggle.click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await toggle.click();
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 10_000 });
  });

  test('answers a bell-schedule question with no map', async ({ page }) => {
    await page.goto('/');
    const box = page.getByPlaceholder('Ask about a teacher, room, or directions…');
    await box.fill('bell schedule');
    await box.press('Enter');
    await expect(page.getByText('1st Period:')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('refuses a room that is not on the plans instead of inventing a route', async ({ page }) => {
    await page.goto('/');
    const box = page.getByPlaceholder('Ask about a teacher, room, or directions…');
    await box.fill('How do I get from room 188 to room 999?');
    await box.press('Enter');
    await expect(page.getByText(/couldn't find Room 999/)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('surfaces a backend failure instead of hanging', async ({ page }) => {
    await page.route('**/api/guest/message', r => r.abort());
    await page.goto('/');
    const box = page.getByPlaceholder('Ask about a teacher, room, or directions…');
    await box.fill('bell schedule');
    await box.press('Enter');
    await expect(page.getByText(/Connection error/)).toBeVisible();
  });

  // The careless user: sending the same thing twice in a row very fast.
  test('a double Enter does not send twice', async ({ page }) => {
    await page.goto('/');
    const box = page.getByPlaceholder('Ask about a teacher, room, or directions…');
    await box.fill('bell schedule');
    await Promise.all([box.press('Enter'), box.press('Enter')]);
    await expect(page.getByText('1st Period:')).toBeVisible();
    // One question bubble, not two.
    await expect(page.getByText('bell schedule', { exact: true })).toHaveCount(1);
  });

  test('guests are offered an account rather than a page that bounces them', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'My Schedule' }).click();
    await expect(page.getByText('My Schedule needs an account')).toBeVisible();
    // Escape closes it — the shared modal behaviour.
    await page.keyboard.press('Escape');
    await expect(page.getByText('My Schedule needs an account')).toHaveCount(0);
  });
});
