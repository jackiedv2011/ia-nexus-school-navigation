import { WALL_M } from './units.js';

/* Every surface texture in the model, painted on canvases at start-up. No
   image files to fetch, nothing to go stale, and the whole set costs a few
   hundred milliseconds once per map. Each texture records the real-world
   size of one repeat (`userData.tileM`) so floors can be mapped in metres. */

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function canvas(w, h) {
  const el = document.createElement('canvas');
  el.width = w; el.height = h;
  return [el, el.getContext('2d')];
}

function grain(c, w, h, n, cols, size, alpha, R) {
  for (let i = 0; i < n; i += 1) {
    c.globalAlpha = alpha * (0.4 + R() * 0.6);
    c.fillStyle = cols[(R() * cols.length) | 0];
    const s = size * (0.5 + R());
    c.fillRect(R() * w, R() * h, s, s);
  }
  c.globalAlpha = 1;
}

function scuffs(c, w, h, n, R, color = '#3a342c', alpha = 0.06) {
  c.strokeStyle = color;
  c.lineCap = 'round';
  for (let i = 0; i < n; i += 1) {
    c.globalAlpha = alpha * (0.4 + R());
    c.lineWidth = 1 + R() * 3;
    c.beginPath();
    const a = R() * 6.28;
    c.arc(R() * w, R() * h, 10 + R() * 70, a, a + 0.2 + R() * 0.7);
    c.stroke();
  }
  c.globalAlpha = 1;
}

// Vinyl composition tile: the floor of nearly every American school.
function vct(size, n, pal, accent, accentP, R) {
  const [el, c] = canvas(size, size);
  const t = size / n;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      c.fillStyle = R() < accentP ? accent : pick(R, pal);
      c.fillRect(i * t, j * t, t, t);
      // the faint marbled streaks VCT is made with
      for (let k = 0; k < 7; k += 1) {
        c.globalAlpha = 0.05 + R() * 0.05;
        c.strokeStyle = R() < 0.5 ? '#ffffff' : '#4a4236';
        c.lineWidth = 1 + R() * 3;
        c.beginPath();
        c.moveTo(i * t + R() * t, j * t + R() * t);
        c.quadraticCurveTo(i * t + R() * t, j * t + R() * t, i * t + R() * t, j * t + R() * t);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
  }
  grain(c, size, size, (size * size) / 55, ['#6b645a', '#f6f2ea', '#8a8173'], 1.6, 0.3, R);
  c.fillStyle = 'rgba(40,34,26,.16)';
  for (let i = 0; i <= n; i += 1) {
    c.fillRect(i * t - 0.6, 0, 1.2, size);
    c.fillRect(0, i * t - 0.6, size, 1.2);
  }
  scuffs(c, size, size, 26, R);
  return el;
}

function carpet(R) {
  const S = 512;
  const [el, c] = canvas(S, S);
  const t = S / 2;
  for (let i = 0; i < 2; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      c.fillStyle = hsl(214, 14, (i + j) % 2 ? 31 : 34);
      c.fillRect(i * t, j * t, t, t);
      c.globalAlpha = 0.06;
      c.fillStyle = '#c7d0da';
      for (let k = 0; k < 40; k += 1) {
        if ((i + j) % 2) c.fillRect(i * t, j * t + k * 6.4, t, 1.4);
        else c.fillRect(i * t + k * 6.4, j * t, 1.4, t);
      }
      c.globalAlpha = 1;
    }
  }
  grain(c, S, S, 26000, ['#1d232b', '#7b8796', '#4d5968', '#8a6b4f'], 1.3, 0.35, R);
  return el;
}

function maple(R) {
  const W = 1024, H = 1024, N = 42;
  const [el, c] = canvas(W, H);
  const sw = W / N;
  for (let i = 0; i < N; i += 1) {
    let y = -R() * H * 0.4;
    while (y < H) {
      const len = (0.22 + R() * 0.45) * H;
      c.fillStyle = hsl(31 + R() * 7, 42 + R() * 12, 60 + R() * 10);
      c.fillRect(i * sw, y, sw, len);
      c.globalAlpha = 0.1;
      c.strokeStyle = '#6b4a2a';
      for (let g = 0; g < 3; g += 1) {
        const x0 = i * sw + R() * sw;
        c.beginPath(); c.moveTo(x0, y);
        c.bezierCurveTo(x0 + R() * 4 - 2, y + len / 3, x0 + R() * 4 - 2, y + len * 0.66, x0, y + len);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(60,40,20,.35)';
      c.fillRect(i * sw, y, sw, 1.5);
      y += len;
    }
    c.fillStyle = 'rgba(60,40,20,.22)';
    c.fillRect(i * sw, 0, 1, H);
  }
  grain(c, W, H, 9000, ['#5a3d22', '#f3dcb8'], 1.4, 0.18, R);
  scuffs(c, W, H, 40, R, '#2a1c10', 0.07);
  return el;
}

function terrazzo(R, base = '#d4cfc5') {
  const S = 512;
  const [el, c] = canvas(S, S);
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  grain(c, S, S, 5200, ['#8d8a84', '#f1eee8', '#b9ab94', '#6f6c68', '#9c4d42', '#c8c2b6'], 3.2, 0.75, R);
  grain(c, S, S, 9000, ['#ffffff', '#555049'], 1, 0.15, R);
  c.fillStyle = 'rgba(60,55,48,.22)';
  c.fillRect(0, 0, S, 1.5); c.fillRect(0, 0, 1.5, S);
  scuffs(c, S, S, 14, R);
  return el;
}

function pavers(R) {
  const S = 512, n = 4, t = S / n;
  const [el, c] = canvas(S, S);
  c.fillStyle = '#6d6a60'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      c.fillStyle = hsl(35, 6, 56 + R() * 12);
      c.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    }
  }
  grain(c, S, S, 8000, ['#3e3a33', '#d8d3c8'], 1.8, 0.25, R);
  grain(c, S, S, 500, ['#4f6b33', '#6b8740'], 2.5, 0.5, R);
  return el;
}

/* Walls: u repeats every 1.6 m, v runs floor (0) to ceiling (1). Painted
   block for the interior with a vinyl cove base, brick outside. */
function wall(kind, R) {
  const W = 512, H = 1024;
  const [el, c] = canvas(W, H);
  const y = (m) => H - (m / WALL_M) * H;
  const pxm = W / 1.6, pym = H / WALL_M;
  if (kind === 'ext') {
    c.fillStyle = '#c7bdb0'; c.fillRect(0, 0, W, H);
    const bh = 0.0667, bw = 0.2032;
    for (let r = 0; r * bh < WALL_M; r += 1) {
      const off = (r % 2) * (bw / 2);
      for (let x = -bw; x < 1.6 + bw; x += bw) {
        c.fillStyle = hsl(12 + R() * 10, 32 + R() * 16, 33 + R() * 12);
        c.fillRect((x + off) * pxm + 1.5, y((r + 1) * bh) + 1.5, bw * pxm - 3, bh * pym - 3);
      }
    }
    grain(c, W, H, 12000, ['#2b1d17', '#e9d8c8'], 1.4, 0.18, R);
    c.fillStyle = '#9a978f'; c.fillRect(0, y(0.4), W, H - y(0.4));
    grain(c, W, H - y(0.4), 0, [], 1, 0, R);
    c.fillStyle = '#8f8b84'; c.fillRect(0, 0, W, y(WALL_M - 0.12));
    return el;
  }
  const base = kind === 'hall' ? '#ebe6da' : '#eeebe4';
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  if (kind === 'hall') {
    c.fillStyle = '#d7cebd'; c.fillRect(0, y(1.1), W, y(0.1) - y(1.1));
    c.fillStyle = '#8f1d22'; c.fillRect(0, y(1.22), W, y(1.1) - y(1.22));
    c.fillStyle = '#5d1216'; c.fillRect(0, y(1.24), W, y(1.22) - y(1.24));
  }
  // painted concrete block: courses every 8", joints every 16"
  const bh = 0.2032, bw = 0.4064;
  c.fillStyle = 'rgba(70,60,48,.08)';
  for (let r = 0; r * bh < WALL_M; r += 1) {
    c.fillRect(0, y(r * bh) - 1, W, 2);
    const off = (r % 2) * (bw / 2);
    for (let x = off; x < 1.6 + bw; x += bw) c.fillRect(x * pxm - 1, y((r + 1) * bh), 2, bh * pym);
  }
  grain(c, W, H, 14000, ['#000000', '#ffffff'], 1.6, 0.05, R);
  // smudges where bags, shoes and hands meet the wall
  for (let i = 0; i < 18; i += 1) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 30 + R() * 50);
    g.addColorStop(0, 'rgba(60,50,40,.07)'); g.addColorStop(1, 'rgba(60,50,40,0)');
    c.save(); c.translate(R() * W, y(0.15 + R() * 1.1)); c.scale(1.6, 0.7);
    c.fillStyle = g; c.fillRect(-90, -90, 180, 180); c.restore();
  }
  c.fillStyle = '#34302c'; c.fillRect(0, y(0.1), W, H - y(0.1));
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, y(0.1), W, 2);
  return el;
}

function gradient(kind) {
  if (kind === 'blob') {
    const [el, c] = canvas(128, 128);
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(0.55, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return el;
  }
  // ao: dark at v=0 (against the wall), clear by v=1
  const [el, c] = canvas(4, 64);
  const g = c.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(0.35, 'rgba(0,0,0,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 4, 64);
  return el;
}

// Painting is the slow part, and every map on a page wants the same
// pictures: paint each canvas once per page load and let every kit upload it.
const painted = new Map();
const paint = (key, fn) => {
  if (!painted.has(key)) painted.set(key, fn(rng(hashStr(key))));
  return painted.get(key);
};

export function makeTextures(THREE, maxAniso = 8) {
  const tex = (el, tileM = 1, { srgb = true, wrapT = true } = {}) => {
    const t = new THREE.CanvasTexture(el);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = wrapT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    t.userData.tileM = tileM;
    return t;
  };
  const T = {
    hallFloor: tex(paint('hall', (R) => vct(1024, 8, ['#d9d3c4', '#d4cebe', '#ddd7c9', '#d0c9b8'], '#bdb3a0', 0, R)), 2.4384),
    vct: [
      tex(paint('vct0', (R) => vct(1024, 8, ['#e4e3df', '#dedcd6', '#e8e7e2'], '#8fa6bf', 0, R)), 2.4384),
      tex(paint('vct1', (R) => vct(1024, 8, ['#e6e1d6', '#e0dacd', '#e9e5db'], '#a9c2a4', 0, R)), 2.4384),
      tex(paint('vct2', (R) => vct(1024, 8, ['#dcdad4', '#d6d4ce', '#e2e0da'], '#c9a39c', 0, R)), 2.4384),
    ],
    carpet: tex(paint('carpet', carpet), 1.0),
    maple: tex(paint('maple', maple), 2.4),
    terrazzo: tex(paint('terrazzo', (R) => terrazzo(R)), 1.2),
    concrete: tex(paint('concrete', (R) => terrazzo(R, '#bcb8b0')), 1.2),
    pavers: tex(paint('pavers', pavers), 1.2),
    wallHall: tex(paint('wallHall', (R) => wall('hall', R)), 1.6, { wrapT: false }),
    wallRoom: tex(paint('wallRoom', (R) => wall('room', R)), 1.6, { wrapT: false }),
    wallExt: tex(paint('wallExt', (R) => wall('ext', R)), 1.6, { wrapT: false }),
    blob: tex(paint('blob', () => gradient('blob')), 1, { srgb: false, wrapT: false }),
    ao: tex(paint('ao', () => gradient('ao')), 1, { srgb: false, wrapT: false }),
  };
  ['blob', 'ao'].forEach((k) => {
    T[k].wrapS = THREE.ClampToEdgeWrapping;
  });
  T.all = Object.values(T).flat();
  return T;
}
