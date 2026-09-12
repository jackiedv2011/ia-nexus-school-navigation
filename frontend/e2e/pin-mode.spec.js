import { test, expect } from './fixtures.js';

// Pin mode: drop a pin on a floor plan instead of naming a room.
//
// The thing that can silently break here is the coordinate chain — a tap is in
// screen pixels, the model is in world units, and the router speaks blueprint
// pixels. A mistake anywhere in that chain still produces a
// confident-looking route, just to the wrong place. So these tests check what
// the client actually SENDS, not only that a route came back.

import { readFileSync } from 'node:fs';

// The baked floor plans, read rather than imported so this file needs no JSON
// import attribute.
const PLANS = JSON.parse(readFileSync(new URL('../src/lib/floorPlans.json', import.meta.url), 'utf8'));

// The picker shows the floor as the 3D model, seen straight down through an
// orthographic camera. That makes the whole conversion a proportion of the
// frame, which this works out from the floor's own bounds — independently of
// the component, so a mistake in its arithmetic still fails the test.
function expectedBlueprint(fx, fy, floor, frame) {
  const b = PLANS[floor].bbox;
  const aspect = frame.width / frame.height;
  let halfW = ((b.x2 - b.x1) * 1.05) / 2;   // the 5% margin the fit leaves
  let halfH = ((b.y2 - b.y1) * 1.05) / 2;
  if (halfW / halfH < aspect) halfW = halfH * aspect;
  else halfH = halfW / aspect;
  return [
    Math.round((b.x1 + b.x2) / 2 + (fx - 0.5) * 2 * halfW),
    Math.round((b.y1 + b.y2) / 2 + (fy - 0.5) * 2 * halfH),
  ];
}

const picker = (page, which) => page.getByRole('button', {
  name: which === 'start'
    ? /Tap anywhere on this floor to mark where you are/i
    : /Tap anywhere on this floor to mark your destination/i,
});

// Returns the frame that was tapped, so a caller can work out where the tap
// should have landed.
async function tapPlan(page, which, fx, fy) {
  const map = picker(page, which).locator('canvas');
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  return box;
}

test.describe('Route Finder — pin mode', () => {
  test('a tap becomes the blueprint coordinate the router expects', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/route/pin')) sent.push(JSON.parse(r.postData()));
    });

    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();

    const frame = await tapPlan(page, 'start', 0.4, 0.55);

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
    const [ex, ey] = expectedBlueprint(0.4, 0.55, 1, frame);
    expect(Math.abs(from.x - ex), `x was ${from.x}, expected about ${ex}`).toBeLessThanOrEqual(12);
    expect(Math.abs(from.y - ey), `y was ${from.y}, expected about ${ey}`).toBeLessThanOrEqual(12);
  });

  test('routes between two pins on different floors', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();

    // Start: floor 2.
    await page.locator('form').getByRole('button', { name: 'Floor 2' }).first().click();
    await tapPlan(page, 'start', 0.45, 0.6);

    // Destination: another pin, floor 3.
    await page.getByRole('button', { name: 'Another pin' }).click();
    await page.locator('form').getByRole('button', { name: 'Floor 3' }).last().click();
    await tapPlan(page, 'dest', 0.55, 0.35);

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
    await tapPlan(page, 'start', 0.5, 0.5);
    await page.getByRole('button', { name: 'Find Route' }).click();
    await expect(page.getByText(/Choose a destination room/i)).toBeVisible();
  });

  test('switching back to room mode clears the pinned result', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();
    await tapPlan(page, 'start', 0.4, 0.55);
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
