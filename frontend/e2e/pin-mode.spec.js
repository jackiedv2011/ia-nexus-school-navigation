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

// The picker shows the floor as the 3D model, through the same camera as the
// route map — a perspective one that opens overhead and can be turned. There
// is no longer a fixed linear transform to check against, so these check the
// properties that actually break when the chain is wrong: the centre of the
// frame is the centre of the floor, the compass is the right way round, and a
// tap means the same place on the floor however the building is turned.
const centreOf = (floor) => {
  const b = PLANS[floor].bbox;
  return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
};

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

// What the picker reports it has, read back off its accessible name.
async function pinAt(page, which) {
  const name = await picker(page, which).getAttribute('aria-label');
  const m = name.match(/Pin placed at (-?\d+), (-?\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

test.describe('Route Finder — pin mode', () => {
  test('a tap becomes the blueprint coordinate the router expects', async ({ page }) => {
    const sent = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/route/pin')) sent.push(JSON.parse(r.postData()));
    });

    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();

    // Dead centre of the frame is where the camera is pointed, which is the
    // middle of the floor.
    await tapPlan(page, 'start', 0.5, 0.5);
    const [cx, cy] = centreOf(1);
    const middle = await pinAt(page, 'start');
    expect(Math.abs(middle[0] - cx), `x was ${middle[0]}, expected about ${cx}`).toBeLessThanOrEqual(25);
    expect(Math.abs(middle[1] - cy), `y was ${middle[1]}, expected about ${cy}`).toBeLessThanOrEqual(25);

    // East is right and south is down, as on every other plan in the app.
    await tapPlan(page, 'start', 0.68, 0.5);
    const east = await pinAt(page, 'start');
    expect(east[0]).toBeGreaterThan(middle[0]);
    expect(Math.abs(east[1] - middle[1])).toBeLessThanOrEqual(60);

    await tapPlan(page, 'start', 0.5, 0.68);
    const south = await pinAt(page, 'start');
    expect(south[1]).toBeGreaterThan(middle[1]);
    expect(Math.abs(south[0] - middle[0])).toBeLessThanOrEqual(60);

    await tapPlan(page, 'start', 0.4, 0.55);

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

    // And what was sent is what the picker last reported, not a stale value.
    const shown = await pinAt(page, 'start');
    expect([from.x, from.y]).toEqual(shown);
  });

  test('turning the building moves the view, not the pin', async ({ page }) => {
    await page.goto('/route');
    await page.getByRole('tab', { name: /Drop a pin/i }).click();

    const map = picker(page, 'start').locator('canvas');
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    const mx = box.x + box.width / 2;
    const my = box.y + box.height / 2;

    await page.mouse.click(mx, my);
    const before = await pinAt(page, 'start');
    expect(before).not.toBeNull();

    // A drag turns the model. It must not be mistaken for a tap.
    await page.mouse.move(mx, my);
    await page.mouse.down();
    await page.mouse.move(mx + 160, my + 90, { steps: 12 });
    await page.mouse.up();
    expect(await pinAt(page, 'start'), 'a drag moved the pin').toEqual(before);

    // With the building turned, the same screen point is still the same place
    // on the floor — the tap is cast onto the floor, not measured off a fixed
    // picture of it.
    await page.mouse.click(mx, my);
    const after = await pinAt(page, 'start');
    expect(Math.abs(after[0] - before[0])).toBeLessThanOrEqual(25);
    expect(Math.abs(after[1] - before[1])).toBeLessThanOrEqual(25);
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
