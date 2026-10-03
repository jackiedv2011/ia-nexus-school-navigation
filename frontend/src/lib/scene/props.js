import { Geo } from './geo.js';
import { UM } from './units.js';

/* Furniture and fixtures, modelled in metres to real proportions and drawn
   instanced: one prefab is a few InstancedMeshes however many copies a floor
   has. Every prefab's front faces +Z, and anything wall-mounted has its back
   on z = 0, so placing it is just "stand at the wall, face into the room".

   Each part names its material: 'furn' (laminate, fabric, plastic), 'metal',
   'locker' (the painted steel door texture) or 'emit'. A `tint` part is
   white and takes its colour per instance — seat shells, locker banks, bins. */

const legs = (g, xs, zs, h, t, col) => xs.forEach((x) => zs.forEach((z) => g.box(x - t, 0, z - t, x + t, h, z + t, col)));

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
  const M = (fn) => { const m = new THREE.Matrix4(); fn(m); return m; };
  const WOOD = '#c9a878', DARKWOOD = '#7a5a40', STEEL = '#6f747b', ALU = '#c3c7cc';

  // ── classroom ───────────────────────────────────────────────────────────
  def('desk', [
    part('furn', (g) => { g.box(-0.3, 0.7, -0.225, 0.3, 0.73, 0.225, WOOD); }),
    part('metal', (g) => {
      legs(g, [-0.27, 0.27], [-0.19, 0.19], 0.7, 0.013, STEEL);
      g.box(-0.26, 0.56, -0.2, 0.26, 0.66, 0.08, '#4a4f56');
    }),
  ], { blob: [0.75, 0.6] });

  def('chair', [
    part('furn', (g) => {
      g.box(-0.21, 0.43, -0.2, 0.21, 0.46, 0.2, '#ffffff');
      g.box(-0.2, 0.5, 0.17, 0.2, 0.84, 0.2, '#ffffff');
    }, true),
    part('metal', (g) => {
      legs(g, [-0.18, 0.18], [-0.17, 0.17], 0.43, 0.011, STEEL);
      g.box(-0.19, 0.43, 0.17, -0.17, 0.62, 0.19, STEEL);
      g.box(0.17, 0.43, 0.17, 0.19, 0.62, 0.19, STEEL);
    }),
  ], { blob: [0.5, 0.5] });

  def('teacherDesk', [
    part('furn', (g) => {
      g.box(-0.78, 0.72, -0.38, 0.78, 0.755, 0.38, DARKWOOD);
      g.box(0.36, 0, -0.36, 0.76, 0.72, 0.36, '#6c4f38');
      g.box(-0.76, 0.22, -0.37, 0.36, 0.72, -0.34, '#6c4f38');
      g.box(-0.76, 0, -0.36, -0.72, 0.72, 0.36, '#6c4f38');
      g.box(-0.5, 0.755, 0.02, -0.25, 0.78, 0.3, '#f4f4f0');
    }),
    part('metal', (g) => {
      g.box(-0.05, 0.755, -0.3, 0.05, 0.9, -0.26, '#2a2d31');
      g.box(-0.27, 0.86, -0.29, 0.27, 1.17, -0.26, '#16181b');
      g.box(-0.2, 0.755, -0.02, 0.2, 0.775, 0.14, '#2b2e33');
      g.box(0.38, 0.62, 0.36, 0.74, 0.64, 0.37, ALU);
      g.box(0.38, 0.3, 0.36, 0.74, 0.32, 0.37, ALU);
    }),
  ], { blob: [1.7, 0.9] });

  def('officeChair', [
    part('furn', (g) => {
      g.box(-0.25, 0.45, -0.25, 0.25, 0.53, 0.25, '#2c3036');
      g.box(-0.23, 0.58, 0.2, 0.23, 1.0, 0.26, '#2c3036');
    }),
    part('metal', (g) => {
      g.cyl(0.028, 0.42, 0, 0.05, 0, '#3a3e44', 10);
      [0, 1, 2, 3, 4].forEach((k) => g.add(new THREE.BoxGeometry(0.34, 0.04, 0.05),
        M((m) => m.makeRotationY((k * Math.PI * 2) / 5).setPosition(0, 0.06, 0).multiply(new THREE.Matrix4().makeTranslation(0.17, 0, 0))), '#2a2d31'));
      g.box(-0.2, 0.53, 0.2, -0.18, 0.62, 0.24, '#2a2d31');
    }),
  ], { blob: [0.7, 0.7] });

  def('tallCab', [
    part('furn', (g) => { g.box(-0.45, 0, -0.225, 0.45, 1.95, 0.225, '#d9d4ca'); }),
    part('metal', (g) => {
      g.box(-0.004, 0.05, 0.225, 0.004, 1.9, 0.232, '#5a5f66');
      g.box(-0.06, 0.95, 0.225, -0.04, 1.12, 0.25, ALU);
      g.box(0.04, 0.95, 0.225, 0.06, 1.12, 0.25, ALU);
    }),
  ], { blob: [1.0, 0.6] });

  def('counter', [
    part('furn', (g) => {
      g.box(-0.5, 0.1, -0.3, 0.5, 0.87, 0.3, '#e3ddd1');
      g.box(-0.5, 0, -0.3, 0.5, 0.1, 0.24, '#3a3633');
      g.box(-0.5, 0.87, -0.3, 0.5, 0.9, 0.32, '#5f5a55');
      g.box(-0.003, 0.12, 0.3, 0.003, 0.84, 0.305, '#9d978c');
    }),
    part('metal', (g) => {
      g.box(-0.08, 0.7, 0.3, -0.03, 0.72, 0.33, ALU);
      g.box(0.03, 0.7, 0.3, 0.08, 0.72, 0.33, ALU);
    }),
  ]);

  // Three bookcases, stocked differently so a run of them doesn't repeat.
  [0, 1, 2].forEach((v) => {
    let s = 17 + v * 31;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    def(`shelf${v}`, [part('furn', (g) => {
      const W = '#a07a52';
      g.box(-0.45, 0, 0, -0.43, 1.8, 0.3, W); g.box(0.43, 0, 0, 0.45, 1.8, 0.3, W);
      g.box(-0.45, 0, 0, 0.45, 1.8, 0.015, W);
      for (let k = 0; k < 5; k += 1) {
        const y = 0.05 + k * 0.36;
        g.box(-0.43, y, 0, 0.43, y + 0.02, 0.3, W);
        let x = -0.42;
        while (x < 0.38) {
          const bw = 0.02 + r() * 0.035, bh = 0.2 + r() * 0.1;
          if (r() < 0.12) { x += bw * 2; continue; }
          g.box(x, y + 0.02, 0.03, x + bw, y + 0.02 + bh, 0.26,
            `hsl(${Math.floor(r() * 360)},${30 + Math.floor(r() * 40)}%,${30 + Math.floor(r() * 30)}%)`);
          x += bw + 0.003;
        }
      }
      g.box(-0.45, 1.8, 0, 0.45, 1.82, 0.3, W);
    })], { blob: [1.0, 0.5] });
  });

  def('libTable', [
    part('furn', (g) => { g.box(-0.9, 0.72, -0.45, 0.9, 0.75, 0.45, '#d2b48c'); }),
    part('metal', (g) => { legs(g, [-0.84, 0.84], [-0.38, 0.38], 0.72, 0.022, STEEL); }),
  ], { blob: [2.0, 1.1] });

  def('workTable', [
    part('furn', (g) => { g.box(-0.9, 0.86, -0.45, 0.9, 0.9, 0.45, '#9ea3a8'); g.box(-0.85, 0.2, -0.4, 0.85, 0.23, 0.4, '#7c8288'); }),
    part('metal', (g) => { legs(g, [-0.86, 0.86], [-0.41, 0.41], 0.86, 0.025, '#3d4247'); }),
  ], { blob: [2.0, 1.1] });

  def('labBench', [
    part('furn', (g) => {
      g.box(-0.9, 0.1, -0.37, 0.9, 0.88, 0.37, '#dcd6c9');
      g.box(-0.9, 0, -0.37, 0.9, 0.1, 0.33, '#3a3633');
      g.box(-0.92, 0.88, -0.39, 0.92, 0.92, 0.39, '#1f2328');
    }),
    part('metal', (g) => {
      [-0.5, 0.5].forEach((x) => { g.cyl(0.012, 0.18, x, 0.92, -0.3, '#9aa0a6', 8); g.box(x - 0.01, 1.08, -0.3, x + 0.01, 1.1, -0.2, '#9aa0a6'); });
    }),
  ], { blob: [2.0, 0.9] });

  def('stool', [
    part('furn', (g) => { g.cyl(0.17, 0.04, 0, 0.62, 0, '#ffffff', 16); }, true),
    part('metal', (g) => { legs(g, [-0.12, 0.12], [-0.12, 0.12], 0.62, 0.011, STEEL); g.box(-0.13, 0.25, -0.13, 0.13, 0.27, 0.13, STEEL); }),
  ], { blob: [0.45, 0.45] });

  def('confTable', [
    part('furn', (g) => {
      g.box(-1.8, 0.72, -0.6, 1.8, 0.76, 0.6, '#5b4636');
      g.box(-1.2, 0, -0.3, -0.9, 0.72, 0.3, '#4a392c');
      g.box(0.9, 0, -0.3, 1.2, 0.72, 0.3, '#4a392c');
    }),
  ], { blob: [4.0, 1.5] });

  def('computerDesk', [
    part('furn', (g) => { g.box(-0.7, 0.72, -0.35, 0.7, 0.75, 0.35, '#e8e4dc'); g.box(-0.7, 0, -0.35, -0.66, 0.72, 0.35, '#cfcac0'); g.box(0.66, 0, -0.35, 0.7, 0.72, 0.35, '#cfcac0'); }),
    part('metal', (g) => {
      [-0.3, 0.3].forEach((x) => { g.box(x - 0.03, 0.75, -0.26, x + 0.03, 0.9, -0.22, '#2a2d31'); g.box(x - 0.27, 0.86, -0.25, x + 0.27, 1.18, -0.22, '#131518'); });
      g.box(-0.22, 0.75, -0.05, 0.22, 0.77, 0.1, '#2b2e33');
    }),
  ], { blob: [1.6, 0.9] });

  def('bed', [
    part('furn', (g) => { g.box(-0.4, 0.55, 0.05, 0.4, 0.68, 1.95, '#dbe5ee'); g.box(-0.3, 0.68, 0.1, 0.3, 0.76, 0.45, '#f7f8fa'); }),
    part('metal', (g) => { g.box(-0.42, 0.45, 0.02, 0.42, 0.55, 1.98, '#b7bcc2'); legs(g, [-0.38, 0.38], [0.08, 1.92], 0.45, 0.02, STEEL); g.box(-0.42, 0.45, 0.0, 0.42, 1.0, 0.04, '#b7bcc2'); }),
  ], { blob: [1.0, 2.1] });

  def('reception', [
    part('furn', (g) => {
      g.box(-1.3, 0, -0.35, 1.3, 1.05, -0.3, '#7a5a42');
      g.box(-1.3, 1.05, -0.45, 1.3, 1.09, -0.12, '#ece9e2');
      g.box(-1.3, 0.72, -0.3, 1.3, 0.75, 0.4, '#ece9e2');
      g.box(-1.3, 0, -0.3, -1.25, 0.72, 0.4, '#6a4d38');
      g.box(1.25, 0, -0.3, 1.3, 0.72, 0.4, '#6a4d38');
    }),
    part('metal', (g) => { g.box(-0.25, 0.75, -0.2, 0.25, 1.05, -0.17, '#131518'); g.box(0.4, 0.75, -0.1, 0.6, 0.77, 0.1, '#2b2e33'); }),
  ], { blob: [2.8, 1.1] });

  // ── hallways ────────────────────────────────────────────────────────────
  def('bench', [
    part('furn', (g) => { for (let k = 0; k < 4; k += 1) g.box(-0.75, 0.43, k * 0.1 + 0.02, 0.75, 0.47, k * 0.1 + 0.1, '#a8773f'); }),
    part('metal', (g) => { [-0.6, 0.6].forEach((x) => { g.box(x - 0.02, 0, 0.04, x + 0.02, 0.43, 0.08, '#3d4247'); g.box(x - 0.02, 0, 0.34, x + 0.02, 0.43, 0.38, '#3d4247'); g.box(x - 0.02, 0.4, 0.04, x + 0.02, 0.43, 0.38, '#3d4247'); }); }),
  ], { blob: [1.7, 0.6] });

  def('trash', [part('furn', (g) => { g.cyl(0.2, 0.62, 0, 0, 0, '#4a4f55', 16); g.cyl(0.21, 0.04, 0, 0.62, 0, '#3a3e43', 16); })], { blob: [0.5, 0.5] });
  def('recycle', [part('furn', (g) => { g.cyl(0.2, 0.62, 0, 0, 0, '#ffffff', 16); g.cyl(0.21, 0.04, 0, 0.62, 0, '#e8e8e8', 16); }, true)], { blob: [0.5, 0.5] });

  def('fountain', [part('metal', (g) => {
    g.box(-0.24, 0.72, 0, 0.24, 0.95, 0.46, '#b8bcc0');
    g.box(-0.18, 0.95, 0.12, 0.18, 0.955, 0.4, '#d9dcdf');
    g.box(-0.1, 0.3, 0, 0.1, 0.72, 0.12, '#9ea2a6');
  })], { blob: [0.6, 0.6] });

  def('plant', [
    part('furn', (g) => { g.cyl(0.15, 0.3, 0, 0, 0, '#8a5a3c', 14, 0.18); g.blobby(0.3, 0, 0.62, 0, '#4a7a3f', 1.2); g.blobby(0.2, 0.12, 0.85, 0.05, '#5b8c48'); }),
  ], { blob: [0.6, 0.6] });

  def('tree', [
    part('furn', (g) => {
      g.cyl(0.11, 2.1, 0, 0, 0, '#5d4631', 10, 0.08);
      g.blobby(1.25, 0, 2.7, 0, '#4f7d3c', 0.9);
      g.blobby(0.85, 0.5, 3.3, 0.3, '#5f9148', 0.9);
      g.blobby(0.7, -0.6, 3.0, -0.4, '#46703a', 0.9);
    }),
  ], { blob: [3.2, 3.2] });

  def('planter', [part('furn', (g) => {
    g.box(-0.9, 0, -0.4, 0.9, 0.45, 0.4, '#9a978f');
    g.box(-0.85, 0.45, -0.35, 0.85, 0.47, 0.35, '#4a3a2a');
    for (let k = 0; k < 5; k += 1) g.blobby(0.22, -0.7 + k * 0.35, 0.6, (k % 2) * 0.12 - 0.06, '#5b8c48');
  })], { blob: [2.0, 1.0] });

  def('locker', [
    part('locker', (g) => {
      g.box(-0.15, 0.1, 0, 0.15, 1.93, 0.38, '#ffffff', {
        uv: (p, n, dir) => (dir === 'pz' ? [(p[0] + 0.15) / 0.3, (p[1] - 0.1) / 1.83] : [0.3, 0.5]),
      });
    }, true),
    part('metal', (g) => { g.box(-0.15, 0, 0, 0.15, 0.1, 0.36, '#2f3236'); }),
  ]);

  // ── gym ─────────────────────────────────────────────────────────────────
  def('bleacher', [
    part('furn', (g) => {
      for (let k = 0; k < 5; k += 1) {
        const z = 2.4 - k * 0.55, h = 0.35 + k * 0.4;
        g.box(-1, 0, z - 0.55, 1, h - 0.05, z, '#8e949b');
        g.box(-1, h - 0.05, z - 0.3, 1, h, z, '#c89a5c');
      }
    }),
  ], { blob: [2.1, 2.8] });

  def('hoop', [
    part('furn', (g) => { g.box(-0.9, 2.05, 1.2, 0.9, 2.95, 1.24, '#f7f7f5'); g.box(-0.3, 2.3, 1.244, 0.3, 2.62, 1.25, '#c2410c'); }),
    part('metal', (g) => {
      g.box(-0.04, 2.5, 0, 0.04, 2.58, 1.2, '#2f3236');
      g.box(-0.3, 0, 0, 0.3, 0.02, 0.02, '#2f3236');
      g.add(new THREE.TorusGeometry(0.23, 0.012, 6, 20), M((m) => m.makeRotationX(Math.PI / 2).setPosition(0, 2.33, 1.5)), '#e0521b');
    }),
  ]);

  def('gymMat', [part('furn', (g) => { g.box(-1, 0, -0.6, 1, 0.12, 0.6, '#ffffff'); g.box(-1, 0.12, -0.6, 1, 0.24, 0.6, '#ffffff'); }, true)], { blob: [2.2, 1.4] });

  // ── fixtures ────────────────────────────────────────────────────────────
  def('extinguisher', [
    part('metal', (g) => { g.cyl(0.075, 0.5, 0, 0.85, 0.1, '#c81e1e', 14); g.cyl(0.02, 0.08, 0, 1.35, 0.1, '#1f2328', 8); g.box(-0.05, 1.0, 0, 0.05, 1.05, 0.04, '#2f3236'); }),
  ], { shadow: false });

  def('pull', [part('furn', (g) => { g.box(-0.06, 1.15, 0, 0.06, 1.32, 0.06, '#d42020'); g.box(-0.03, 1.2, 0.06, 0.03, 1.24, 0.075, '#ffffff'); })], { shadow: false });

  def('exitBox', [part('furn', (g) => { g.box(-0.2, 0, 0, 0.2, 0.2, 0.07, '#f2f2ef'); })], { shadow: false });

  def('projector', [
    part('furn', (g) => { g.box(-0.18, 2.6, -0.15, 0.18, 2.72, 0.15, '#e8e8e5'); }),
    part('metal', (g) => { g.box(-0.02, 2.72, -0.02, 0.02, wallM, 0.02, '#8a8f95'); g.cyl(0.035, 0.03, 0.1, 2.63, -0.18, '#1b1d20', 12); }),
  ]);

  def('wbFrame', [part('metal', (g) => { g.box(-0.5, -0.5, 0, 0.5, 0.5, 0.02, ALU); })], { shadow: false });
  def('wbTray', [part('metal', (g) => { g.box(-0.5, 0, 0, 0.5, 0.03, 0.08, ALU); })], { shadow: false });
  def('tvBody', [part('metal', (g) => { g.box(-0.64, -0.37, 0, 0.64, 0.37, 0.06, '#15171a'); })], { shadow: false });

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
