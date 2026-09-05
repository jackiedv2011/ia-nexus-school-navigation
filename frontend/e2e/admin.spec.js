import { test, expect } from '@playwright/test';

const KEY = 'e2e-admin-key';

test.describe('Admin dashboard', () => {
  test('prompts for a key and rejects the wrong one', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    await page.getByLabel('Admin key').fill('definitely-not-the-key');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText(/rejected/)).toBeVisible();
    // A rejected key must not be remembered.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
  });

  test('unlocks with the right key and shows every tab', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Admin key').fill(KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();

    await expect(page.getByText('Questions asked')).toBeVisible();
    await expect(page.getByText('Questions, last 7 days')).toBeVisible();

    for (const tab of ['Questions', 'Flagged', 'Feedback', 'Security events', 'Access log']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      // Either rows or an explicit empty state — never a blank panel.
      await expect(page.locator('table, p').first()).toBeVisible();
    }
  });

  test('Lock forgets the key', async ({ page }) => {
    await page.goto('/admin');
    await page.getByLabel('Admin key').fill(KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('Questions asked')).toBeVisible();

    await page.getByRole('button', { name: 'Lock' }).click();
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
  });
});
