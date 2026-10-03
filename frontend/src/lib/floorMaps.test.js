import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOOR_MAPS, MAP_IMAGE_SCALE, floorMap, blueprintToImage, imageToBlueprint } from './floorMaps';
import MAP_LABELS from './mapLabels.json';
import PLANS from './floorPlans.json';

// The pin picker turns a tap on a floor plan into a blueprint coordinate, and
// NavigationMap turns blueprint coordinates back into pixels to draw a route on
// that same plan. If those two disagree even slightly, a student's pin lands
// somewhere other than where they tapped — and the map would still look
// perfectly plausible, which is what makes it worth testing rather than eyeballing.

describe('the blueprint↔image transform', () => {
  it('covers all three floors', () => {
    for (const floor of [1, 2, 3]) {
      const m = FLOOR_MAPS[floor];
      expect(m, `floor ${floor} has no map`).toBeTruthy();
      expect(m.w).toBeGreaterThan(0);
      expect(m.h).toBeGreaterThan(0);
      expect(m.scale).toBeGreaterThan(0);
      expect(m.src).toMatch(/^\/maps\/floor[123]\.png$/);
    }
  });

  it('round-trips a point back to where it started', () => {
    for (const floor of [1, 2, 3]) {
      for (const p of [[0, 0], [1224, 792], [2448, 1584], [700, 500], [1863, 1301]]) {
        const back = imageToBlueprint(blueprintToImage(p, floor), floor);
        expect(back[0]).toBeCloseTo(p[0], 6);
        expect(back[1]).toBeCloseTo(p[1], 6);
      }
    }
  });

  it('round-trips in the other direction too — a tap converts back to itself', () => {
    for (const floor of [1, 2, 3]) {
      const m = floorMap(floor);
      for (const p of [[0, 0], [m.w / 2, m.h / 2], [m.w, m.h], [12.5, 340.25]]) {
        const back = blueprintToImage(imageToBlueprint(p, floor), floor);
        expect(back[0]).toBeCloseTo(p[0], 6);
        expect(back[1]).toBeCloseTo(p[1], 6);
      }
    }
  });

  it('applies each floor its OWN transform, not floor 1\'s for everything', () => {
    // The three plans are different crops at different scales. A shared
    // transform would put floor 2 and 3 pins tens of metres out.
    const p = [1224, 792];
    const [a, b, c] = [1, 2, 3].map(f => blueprintToImage(p, f));
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
  });

  it('falls back to a real map rather than crashing on an unknown floor', () => {
    expect(floorMap(9)).toBe(FLOOR_MAPS[1]);
    expect(floorMap(undefined)).toBe(FLOOR_MAPS[1]);
  });

  it('places a known stairwell inside its own floor plan', () => {
    // Stair 4's floor-1 landing, from backend/data/roomCoordinates.js. It must
    // land inside the drawing — a transform that is off by a sign or a factor
    // puts it off the edge, which is the failure this catches.
    const [x, y] = blueprintToImage([1309, 1266], 1);
    const m = floorMap(1);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(m.w);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(m.h);
  });
});

// The plan images are served at MAP_IMAGE_SCALE × the size FLOOR_MAPS gives,
// and their room labels are drawn as text from mapLabels.json. Both live in the
// plan's own coordinate space, so a mismatch would shift every label (and, if
// someone "fixed" it by changing w/h, every route and pin) off the drawing.
describe('the floor plan images and their labels', () => {
  const pngSize = (floor) => {
    const file = join(dirname(fileURLToPath(import.meta.url)), `../../public/maps/floor${floor}.png`);
    const buf = readFileSync(file);
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  };

  it('ships each plan image at exactly MAP_IMAGE_SCALE × its plan size', () => {
    for (const floor of [1, 2, 3]) {
      const m = FLOOR_MAPS[floor];
      expect(pngSize(floor), `floor ${floor}`).toEqual([m.w * MAP_IMAGE_SCALE, m.h * MAP_IMAGE_SCALE]);
    }
  });

  it('labels every room the router can route to, on its own floor', () => {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9/]/g, '');
    for (const floor of ['1', '2', '3']) {
      const labels = MAP_LABELS[floor].map((l) => norm(l.text));
      const rooms = new Set(PLANS[floor].DOORS.map((d) => d.room));
      for (const room of rooms) {
        expect(labels.some((t) => t.startsWith(norm(room))), `floor ${floor} has no label for ${room}`).toBe(true);
      }
    }
  });

  it('puts every label on its plan', () => {
    for (const floor of ['1', '2', '3']) {
      const m = FLOOR_MAPS[floor];
      for (const l of MAP_LABELS[floor]) {
        expect(l.x, l.text).toBeGreaterThan(0);
        expect(l.x, l.text).toBeLessThan(m.w);
        expect(l.y, l.text).toBeGreaterThan(0);
        expect(l.y, l.text).toBeLessThan(m.h);
        expect(l.size, l.text).toBeGreaterThan(0);
      }
    }
  });
});
