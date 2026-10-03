/* Bakes every segment the router actually walks, per floor, into
   frontend/src/lib/walkEdges.json.

   The 3D model's walls are drawn from inferred and traced room outlines,
   which can disagree with the router by a few pixels. The model uses these
   edges to guarantee it never blocks a real route: any wall a walk crosses
   or runs along gets an opening, and nothing is placed on a walk.

   Run after changing roomCoordinates.js:  node backend/scripts/buildWalkEdges.js */

const fs = require('fs');
const path = require('path');
const R = require('../data/roomCoordinates.js');
const PLANS = require('../../frontend/src/lib/floorPlans.json');

const rooms = [];
for (const f of [1, 2, 3]) for (const name of new Set(PLANS[f].ROOMS.map((o) => o.name))) rooms.push([name, f]);

const edges = { 1: new Set(), 2: new Set(), 3: new Set() };
let routes = 0;
const add = (f, pts) => {
  for (let i = 1; i < (pts || []).length; i++) {
    const a = pts[i - 1].map(Math.round), b = pts[i].map(Math.round);
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
    edges[f].add(`${p[0]},${p[1]},${q[0]},${q[1]}`);
  }
};
for (const [a, fa] of rooms) {
  for (const [b, fb] of rooms) {
    if (a === b && fa === fb) continue;
    const res = R.findPath(a, fa, b, fb);
    if (!res || res.error) continue;
    routes++;
    add(fa, res.path1);
    if (res.path2) add(fb, res.path2);
  }
}
const out = {};
for (const f of [1, 2, 3]) out[f] = [...edges[f]].map((s) => s.split(',').map(Number));
const dest = path.join(__dirname, '../../frontend/src/lib/walkEdges.json');
fs.writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(`${routes} routes → ${out[1].length + out[2].length + out[3].length} unique walk segments`);
