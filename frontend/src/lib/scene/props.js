import { Geo } from './geo.js';
import { UM } from './units.js';

/* The building's fittings — doors, door frames, windows and stair railings —
   modelled in metres to real proportions and drawn instanced: one prefab is a
   few InstancedMeshes however many copies a floor has. Every prefab's front
   faces +Z, and anything wall-mounted has its back on z = 0.

   Each part names its material: 'furn' (painted or laminate) or 'metal'. */


export function makePrefabs(THREE, { wallM }) {
  const P = {};
  const part = (mat, fn, tint = false) => { const g = new Geo(THREE); fn(g); return { g, mat, tint }; };
  const def = (name, parts, o = {}) => {
    P[name] = {
      parts: parts.map((p) => {
        const geo = p.g.build();
        geo.scale(UM, UM, UM);
        geo.computeBoundingSphere();
        return { geo, mat: p.mat, tint: p.tint };
      }),
      shadow: o.shadow !== false,
      blob: o.blob || null,
    };
  };

  // A classroom door, hinged at the origin, the leaf running along +X.
  def('leaf', [
    part('furn', (g) => { g.box(0, 0, -0.022, 0.9, 2.1, 0.022, '#b98b5a'); }),
    part('metal', (g) => {
      g.box(0.56, 1.1, -0.025, 0.72, 1.82, 0.025, '#2b3a44');
      g.box(0.02, 0.02, -0.024, 0.88, 0.27, 0.024, '#aeb2b6');
      [-1, 1].forEach((s) => {
        g.box(0.8, 0.98, s * 0.024, 0.82, 1.03, s * 0.07, '#b9bdc2');
        g.box(0.7, 1.0, s * 0.06, 0.82, 1.025, s * 0.075, '#b9bdc2');
      });
      g.box(0.05, 2.02, 0.022, 0.4, 2.07, 0.07, '#3d4247');
    }),
  ]);

  const half = 0.15;                  // half the 0.3 m wall
  def('jamb', [part('metal', (g) => { g.box(-0.03, 0, -half - 0.015, 0.03, 2.19, half + 0.015, '#4d545c'); })], { shadow: false });
  def('head', [part('metal', (g) => { g.box(-0.5, 2.13, -half - 0.015, 0.5, 2.19, half + 0.015, '#4d545c'); })], { shadow: false });

  // An aluminium window, 1.2 m wide and 1.4 m tall, sitting on its sill.
  def('winFrame', [part('metal', (g) => {
    const d = half + 0.01, A = '#b9bec3';
    g.box(-0.6, 0, -d, -0.55, 1.4, d, A); g.box(0.55, 0, -d, 0.6, 1.4, d, A);
    g.box(-0.6, 0, -d, 0.6, 0.05, d, A); g.box(-0.6, 1.35, -d, 0.6, 1.4, d, A);
    g.box(-0.02, 0, -0.03, 0.02, 1.4, 0.03, A); g.box(-0.6, 0.48, -0.03, 0.6, 0.52, 0.03, A);
    g.box(-0.62, -0.03, -d - 0.08, 0.62, 0, d + 0.08, '#d9d4ca');
  })], { shadow: false });

  // Railings, as unit pieces stretched to fit.
  def('rail', [part('metal', (g) => { g.box(-0.025, -0.025, -0.5, 0.025, 0.025, 0.5, '#9aa0a6'); })], { shadow: false });
  def('post', [part('metal', (g) => { g.box(-0.015, 0, -0.015, 0.015, 1, 0.015, '#6f747b'); })], { shadow: false });

  return P;
}
