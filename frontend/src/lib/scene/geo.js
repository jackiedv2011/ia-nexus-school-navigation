/* A small geometry accumulator. Everything static on a floor — walls, floors,
   ceilings, signs, stairs — is poured into a handful of these and built once,
   so a floor costs a few dozen draw calls rather than thousands. */

export class Geo {
  constructor(THREE) {
    this.T = THREE;
    this.p = []; this.n = []; this.uv = []; this.c = []; this.i = [];
    this.cache = new Map();
  }

  get count() { return this.p.length / 3; }
  get empty() { return this.i.length === 0; }

  col(h) {
    if (Array.isArray(h)) return h;
    if (!this.cache.has(h)) {
      const c = new this.T.Color(h);
      this.cache.set(h, [c.r, c.g, c.b]);
    }
    return this.cache.get(h);
  }

  /** A quad a-b-c-d. Winding is fixed up to face `n`, whatever order it came in. */
  quad(a, b, c, d, n, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], col = '#ffffff') {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cr = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    let pts = [a, b, c, d];
    let uvs = uv;
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) {
      pts = [a, d, c, b];
      uvs = [uv[0], uv[3], uv[2], uv[1]];
    }
    const cc = this.col(col);
    const base = this.count;
    pts.forEach((p, k) => {
      this.p.push(p[0], p[1], p[2]);
      this.n.push(n[0], n[1], n[2]);
      this.uv.push(uvs[k][0], uvs[k][1]);
      this.c.push(cc[0], cc[1], cc[2]);
    });
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * An axis-aligned box. `o.uv(p, n, dir)` gives each corner's UV, `o.top`
   * colours the top face, `o.route(dir)` can send a face to another Geo (or
   * drop it by returning null), `o.bottom` adds the underside.
   */
  box(x1, y1, z1, x2, y2, z2, col = '#ffffff', o = {}) {
    const X1 = Math.min(x1, x2), X2 = Math.max(x1, x2);
    const Y1 = Math.min(y1, y2), Y2 = Math.max(y1, y2);
    const Z1 = Math.min(z1, z2), Z2 = Math.max(z1, z2);
    const uvf = o.uv || (() => [0, 0]);
    const face = (dir, pts, n, c) => {
      const g = o.route ? o.route(dir) : this;
      if (!g) return;
      g.quad(pts[0], pts[1], pts[2], pts[3], n, pts.map((p) => uvf(p, n, dir)), c);
    };
    face('px', [[X2, Y1, Z1], [X2, Y1, Z2], [X2, Y2, Z2], [X2, Y2, Z1]], [1, 0, 0], col);
    face('nx', [[X1, Y1, Z2], [X1, Y1, Z1], [X1, Y2, Z1], [X1, Y2, Z2]], [-1, 0, 0], col);
    face('pz', [[X1, Y1, Z2], [X2, Y1, Z2], [X2, Y2, Z2], [X1, Y2, Z2]], [0, 0, 1], col);
    face('nz', [[X2, Y1, Z1], [X1, Y1, Z1], [X1, Y2, Z1], [X2, Y2, Z1]], [0, 0, -1], col);
    face('py', [[X1, Y2, Z1], [X1, Y2, Z2], [X2, Y2, Z2], [X2, Y2, Z1]], [0, 1, 0], o.top || col);
    if (o.bottom) face('ny', [[X1, Y1, Z1], [X2, Y1, Z1], [X2, Y1, Z2], [X1, Y1, Z2]], [0, -1, 0], col);
  }

  /** Append a three.js geometry, transformed, in one flat colour. */
  add(g, matrix, col = '#ffffff') {
    const T = this.T;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const nm = new T.Matrix3().getNormalMatrix(matrix);
    const v = new T.Vector3();
    const cc = this.col(col);
    const base = this.count;
    for (let k = 0; k < pos.count; k += 1) {
      v.fromBufferAttribute(pos, k).applyMatrix4(matrix);
      this.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
      this.n.push(v.x, v.y, v.z);
      this.uv.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0);
      this.c.push(cc[0], cc[1], cc[2]);
    }
    if (g.index) for (let k = 0; k < g.index.count; k += 1) this.i.push(base + g.index.getX(k));
    else for (let k = 0; k < pos.count; k += 1) this.i.push(base + k);
    g.dispose();
  }

  cyl(r, h, x, y, z, col, seg = 14, rTop = r) {
    this.add(new this.T.CylinderGeometry(rTop, r, h, seg),
      new this.T.Matrix4().makeTranslation(x, y + h / 2, z), col);
  }

  blobby(r, x, y, z, col, sy = 1) {
    const m = new this.T.Matrix4().makeScale(1, sy, 1).setPosition(x, y, z);
    this.add(new this.T.IcosahedronGeometry(r, 1), m, col);
  }

  build() {
    const T = this.T;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}
