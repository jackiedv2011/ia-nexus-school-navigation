import { test, expect } from './fixtures.js';

// Pin mode: drop a pin on a floor plan instead of naming a room.
//
// The thing that can silently break here is the coordinate chain — a tap is in
// screen pixels, the plan is in its own image pixels, and the router speaks
// blueprint pixels. A mistake anywhere in that chain still produces a
// confident-looking route, just to the wrong place. So these tests check what
// the client actually SENDS, not only that a route came back.

const FLOOR_MAPS = {
  1: { w: 1222, h: 681, scale: 0.50118, dx:   -3.5, dy:  -8.7 },
  2: { w:  873, h: 653, scale: 0.41653, dx:  -76.1, dy:  -1.2 },
  3: { w:  982, h: 762, scale: 0.49983, dx: -130.5, dy: -11.2 },
};

// What a tap at (fx, fy) as a fraction of the plan SHOULD become in blueprint
// space, worked out independently of the app's own code.
function expectedBlueprint(fx, fy, floor) {
  const m = FLOOR_MAPS[floor];
  return [
    Math.round((fx * m.w - m.dx) / m.scale),
    Math.round((fy * m.h - m.dy) / m.scale),
  ];
}

async function tapPlan(page, floor, fx, fy) {
  const img = page.locator(`img[alt="Floor ${floor} plan"]`).first();
  await expect(img).toBeVisible();
  const box = await img.boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test.describe('Route Finder — pin mode', () => {
  test('a tap becomes the blueprint coordinate the router expects', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/route/pin')) sent.push(JSON.parse(r.postData()));
    });

    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();

    await tapPlan(page, 1, 0.4, 0.55);

    // Destination: floor 3, room 331.
    await page.locator('form').getByRole('button', { name: 'Floor 3' }).last().click();
    await page.getByRole('button', { name: '331', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();

    await expect(page.getByText('Route Found', { exact: true })).toBeVisible({ timeout: 10_000 });

    expect(sent.length, 'the pin endpoint should have been called once').toBe(1);
    const { from, to } = sent[0];
    expect(from.kind).toBe('point');
    expect(from.floor).toBe(1);
    expect(to).toEqual({ kind: 'room', room: '331', floor: 3 });

    // Within a couple of blueprint pixels — the mouse lands on a whole screen
    // pixel, so exact equality would be flaky, but anything more than a few px
    // means the transform is wrong.
    const [ex, ey] = expectedBlueprint(0.4, 0.55, 1);
    expect(Math.abs(from.x - ex), `x was ${from.x}, expected about ${ex}`).toBeLessThanOrEqual(4);
    expect(Math.abs(from.y - ey), `y was ${from.y}, expected about ${ey}`).toBeLessThanOrEqual(4);
  });

  test('routes between two pins on different floors', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();

    // Start: floor 2.
    await page.locator('form').getByRole('button', { name: 'Floor 2' }).first().click();
    await tapPlan(page, 2, 0.45, 0.6);

    // Destination: another pin, floor 3.
    await page.getByRole('button', { name: 'Another pin' }).click();
    await page.locator('form').getByRole('button', { name: 'Floor 3' }).last().click();
    await tapPlan(page, 3, 0.55, 0.35);

    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText('Route Found', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Both legs drawn, and a stairwell named — it is a cross-floor trip.
    // .first() because the route summary also has a screen-reader-only
    // description carrying the same words.
    await expect(page.getByText(/Pinned spot on Floor 2/).first()).toBeVisible();
    await expect(page.getByText(/Pinned spot on Floor 3/).first()).toBeVisible();
    await expect(page.getByText(/Stair \d+/).first()).toBeVisible();
  });

  test('asks for a start before it will search', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText(/Tap the map to set your starting point/i)).toBeVisible();
  });

  test('asks for a destination once a start is set', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();
    await tapPlan(page, 1, 0.5, 0.5);
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText(/Choose a destination room/i)).toBeVisible();
  });

  test('switching back to room mode clears the pinned result', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();
    await tapPlan(page, 1, 0.4, 0.55);
    await page.locator('form').getByRole('button', { name: 'Floor 3' }).last().click();
    await page.getByRole('button', { name: '331', exact: true }).click();
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText('Route Found', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('tab', { name: /Pick rooms/i }).click();
    await expect(page.getByText('Route Found', { exact: true })).toHaveCount(0);
  });

  test('the map is reachable and usable with the keyboard', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();

    const plan = page.getByRole('button', { name: /Tap anywhere on this floor to mark where you are/i });
    await plan.focus();
    await page.keyboard.press('Enter');          // drops a pin in the middle
    await expect(page.getByText(/Pin set on Floor 1/)).toBeVisible();

    // Arrow keys nudge it, and the accessible name reports the new position.
    const before = await plan.getAttribute('aria-label');
    await page.keyboard.press('ArrowRight');
    await expect(async () => {
      expect(await plan.getAttribute('aria-label')).not.toBe(before);
    }).toPass();
  });
});
