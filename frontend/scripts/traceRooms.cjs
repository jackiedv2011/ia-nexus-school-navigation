/* Traces each room's true outline from the school's floor-plan scans.

   floorPlans.json only knows where doorways are, so its room boxes are
   guesses. The scans draw every room as a closed rectangle: flood-filling
   the scan from a point just inside a room's doorway recovers that
   rectangle. The result is written to src/lib/roomOutlines.json and used by
   the 3D model for walls only — the router's corridors, doorways and stair
   landings (roomCoordinates.js) are untouched.

   Needs the dev server running:  npm run dev  →  node scripts/traceRooms.cjs */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage();
  await page.goto('http://localhost:5183/');
  const out = await page.evaluate(async () => {
    const PLANS = (await import('/src/lib/floorPlans.json')).default;
    const { FLOOR_MAPS } = await import('/src/lib/floorMaps.js');
    const PXM = 2448 / 140;                    // blueprint px per metre
    const result = {};
    for (const f of [1, 2, 3]) {
      const m = FLOOR_MAPS[f];
      const img = new Image(); img.src = m.src; await img.decode();
      const W = m.w, H = m.h;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, W, H).data;
      const ink = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) ink[i] = d[i * 4 + 3] > 40 && (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3 < 185 ? 1 : 0;
      // close doorway gaps (≈1 m) so a fill stays inside its room
      const R = Math.round(0.55 * PXM * m.scale);
      const wall = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) {
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const X = x + dx, Y = y + dy;
          if (X >= 0 && Y >= 0 && X < W && Y < H) wall[Y * W + X] = 1;
        }
      }
      const toImg = ([x, y]) => [Math.round(x * m.scale + m.dx), Math.round(y * m.scale + m.dy)];
      const toBp = ([x, y]) => [(x - m.dx) / m.scale, (y - m.dy) / m.scale];
      const fill = ([sx, sy]) => {
        if (sx < 0 || sy < 0 || sx >= W || sy >= H || wall[sy * W + sx]) return null;
        const seen = new Uint8Array(W * H); const st = [sy * W + sx]; seen[st[0]] = 1;
        let n = 0, x1 = W, y1 = H, x2 = 0, y2 = 0;
        while (st.length) {
          const i = st.pop(); const x = i % W, y = (i / W) | 0; n++;
          if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
          if (n > W * H / 6) return null;      // leaked outside
          for (const j of [i - 1, i + 1, i - W, i + W]) {
            const jx = j % W;
            if (j < 0 || j >= W * H || Math.abs(jx - x) > 1 || seen[j] || wall[j]) continue;
            seen[j] = 1; st.push(j);
          }
        }
        // the fill stops R short of each wall line; grow back to the line
        return { x1: x1 - R, y1: y1 - R, x2: x2 + R, y2: y2 + R, n };
      };
      const rooms = {};
      PLANS[f].ROOMS.forEach((r) => {
        const cands = [];
        r.doors.forEach((door) => {
          const doorRec = PLANS[f].DOORS.find((o) => Math.abs(o.at[0] - door[0]) < 2 && Math.abs(o.at[1] - door[1]) < 2);
          let dir = doorRec ? [door[0] - doorRec.foot[0], door[1] - doorRec.foot[1]] : [0, 0];
          if (Math.hypot(...dir) < 3) {
            const q = r.rect; dir = [(q.x1 + q.x2) / 2 - door[0], (q.y1 + q.y2) / 2 - door[1]];
            if (Math.abs(dir[0]) > Math.abs(dir[1])) dir[1] = 0; else dir[0] = 0;
          }
          const len = Math.hypot(...dir) || 1; dir = [dir[0] / len, dir[1] / len];
          for (const k of [1.4, 2.0, 2.8, 3.6]) {
            const seed = toImg([door[0] + dir[0] * k * PXM, door[1] + dir[1] * k * PXM]);
            const got = fill(seed);
            if (got) { cands.push(got); break; }
          }
        });
        if (!cands.length) return;
        const best = cands.sort((a, b) => b.n - a.n)[0];
        const bw = best.x2 - best.x1, bh = best.y2 - best.y1;
        const fillRatio = best.n / Math.max(1, (bw - 2 * R) * (bh - 2 * R));
        const [a, b2] = [toBp([best.x1, best.y1]), toBp([best.x2, best.y2])];
        const areaM2 = ((b2[0] - a[0]) * (b2[1] - a[1])) / (PXM * PXM);
        if (areaM2 < 3 || areaM2 > 700 || fillRatio < 0.55) return;
        rooms[r.name + '@' + r.rect.x1] = { x1: Math.round(a[0]), y1: Math.round(a[1]), x2: Math.round(b2[0]), y2: Math.round(b2[1]), fill: +fillRatio.toFixed(2) };
      });
      result[f] = rooms;
    }
    return result;
  });
  await b.close();
  const dest = path.join(__dirname, '../src/lib/roomOutlines.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
  for (const f of [1, 2, 3]) console.log(`floor ${f}: traced ${Object.keys(out[f]).length} rooms`);
})();
