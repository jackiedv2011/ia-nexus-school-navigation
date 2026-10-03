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
const FONT = '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif';

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

function ceiling(R) {
  const S = 512, t = S / 2;
  const [el, c] = canvas(S, S);
  c.fillStyle = '#efede7'; c.fillRect(0, 0, S, S);
  grain(c, S, S, 7000, ['#b3aea4', '#8e897f'], 1.6, 0.3, R);
  c.fillStyle = '#d9d7d1';
  for (let i = 0; i <= 2; i += 1) { c.fillRect(i * t - 4, 0, 8, S); c.fillRect(0, i * t - 4, S, 8); }
  c.fillStyle = 'rgba(0,0,0,.08)';
  for (let i = 0; i <= 2; i += 1) { c.fillRect(i * t + 4, 0, 2, S); c.fillRect(0, i * t + 4, S, 2); }
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

function locker(R) {
  const [el, c] = canvas(128, 512);
  c.fillStyle = '#f2f2ef'; c.fillRect(0, 0, 128, 512);
  c.fillStyle = 'rgba(0,0,0,.05)'; c.fillRect(10, 14, 108, 484);
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 4; c.strokeRect(2, 2, 124, 508);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(6, 6, 3, 500);
  c.fillStyle = 'rgba(15,15,15,.62)';
  for (let k = 0; k < 6; k += 1) { c.fillRect(32, 34 + k * 10, 64, 4); c.fillRect(32, 420 + k * 10, 64, 4); }
  c.fillStyle = '#3a3d42'; c.fillRect(94, 226, 16, 64);
  c.fillStyle = '#9da2a8'; c.fillRect(97, 232, 10, 20);
  c.fillStyle = '#c3c7cc'; c.fillRect(44, 112, 40, 16);
  c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(44, 127, 40, 2);
  grain(c, 128, 512, 900, ['#000000', '#ffffff'], 2, 0.05, R);
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
  if (kind === 'pool') {
    const [el, c] = canvas(128, 128);
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
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

function chevron() {
  const [el, c] = canvas(256, 64);
  c.fillStyle = '#d42a2f'; c.fillRect(0, 0, 256, 64);
  c.fillStyle = '#8e1419'; c.fillRect(0, 0, 256, 5); c.fillRect(0, 59, 256, 5);
  c.fillStyle = 'rgba(255,255,255,.92)';
  [40, 168].forEach((x) => {
    c.beginPath();
    c.moveTo(x, 14); c.lineTo(x + 30, 32); c.lineTo(x, 50); c.lineTo(x + 14, 50); c.lineTo(x + 44, 32); c.lineTo(x + 14, 14);
    c.closePath(); c.fill();
  });
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
    hallFloor: tex(paint('hall', (R) => vct(1024, 8, ['#d9d3c4', '#d4cebe', '#ddd7c9', '#d0c9b8'], '#bdb3a0', 0.06, R)), 2.4384),
    vct: [
      tex(paint('vct0', (R) => vct(1024, 8, ['#e4e3df', '#dedcd6', '#e8e7e2'], '#8fa6bf', 0.07, R)), 2.4384),
      tex(paint('vct1', (R) => vct(1024, 8, ['#e6e1d6', '#e0dacd', '#e9e5db'], '#a9c2a4', 0.06, R)), 2.4384),
      tex(paint('vct2', (R) => vct(1024, 8, ['#dcdad4', '#d6d4ce', '#e2e0da'], '#c9a39c', 0.05, R)), 2.4384),
    ],
    carpet: tex(paint('carpet', carpet), 1.0),
    maple: tex(paint('maple', maple), 2.4),
    terrazzo: tex(paint('terrazzo', (R) => terrazzo(R)), 1.2),
    concrete: tex(paint('concrete', (R) => terrazzo(R, '#bcb8b0')), 1.2),
    pavers: tex(paint('pavers', pavers), 1.2),
    ceiling: tex(paint('ceiling', ceiling), 1.2192),
    wallHall: tex(paint('wallHall', (R) => wall('hall', R)), 1.6, { wrapT: false }),
    wallRoom: tex(paint('wallRoom', (R) => wall('room', R)), 1.6, { wrapT: false }),
    wallExt: tex(paint('wallExt', (R) => wall('ext', R)), 1.6, { wrapT: false }),
    locker: tex(paint('locker', locker), 1, { wrapT: false }),
    blob: tex(paint('blob', () => gradient('blob')), 1, { srgb: false, wrapT: false }),
    pool: tex(paint('pool', () => gradient('pool')), 1, { srgb: false, wrapT: false }),
    ao: tex(paint('ao', () => gradient('ao')), 1, { srgb: false, wrapT: false }),
    chevron: tex(paint('chevron', chevron), 1),
  };
  ['blob', 'pool', 'ao', 'locker'].forEach((k) => {
    T[k].wrapS = THREE.ClampToEdgeWrapping;
  });
  T.all = Object.values(T).flat();
  return T;
}

/** Basketball court lines, drawn to the room's own size. */
export function courtTexture(THREE, wM, dM) {
  const k = 40;                               // px per metre
  const W = Math.min(2048, Math.round(wM * k)), H = Math.min(2048, Math.round(dM * k));
  const sx = W / wM, sy = H / dM;
  const [el, c] = canvas(W, H);
  c.clearRect(0, 0, W, H);
  const long = wM >= dM;
  c.save();
  if (!long) { c.translate(W, 0); c.rotate(Math.PI / 2); }
  const L = long ? wM : dM, B = long ? dM : wM;
  const s = long ? sx : sy;
  const m = 1.0;
  c.lineWidth = 0.06 * s;
  c.strokeStyle = 'rgba(25,55,110,.9)';
  c.strokeRect(m * s, m * s, (L - 2 * m) * s, (B - 2 * m) * s);
  c.beginPath(); c.moveTo((L / 2) * s, m * s); c.lineTo((L / 2) * s, (B - m) * s); c.stroke();
  c.beginPath(); c.arc((L / 2) * s, (B / 2) * s, Math.min(1.8, B / 5) * s, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(143,29,34,.55)';
  c.beginPath(); c.arc((L / 2) * s, (B / 2) * s, Math.min(1.8, B / 5) * s - 0.04 * s, 0, Math.PI * 2); c.fill();
  const keyW = Math.min(4.9, B * 0.3), keyL = Math.min(5.8, L * 0.2);
  [0, 1].forEach((side) => {
    const x0 = side ? (L - m - keyL) * s : m * s;
    c.fillStyle = 'rgba(143,29,34,.45)';
    c.fillRect(x0, (B / 2 - keyW / 2) * s, keyL * s, keyW * s);
    c.strokeRect(x0, (B / 2 - keyW / 2) * s, keyL * s, keyW * s);
    const cx = side ? (L - m - 1.6) * s : (m + 1.6) * s;
    const r = Math.min(6.75, B / 2 - m - 0.3);
    c.beginPath();
    if (side) c.arc(cx, (B / 2) * s, r * s, Math.PI / 2, Math.PI * 1.5);
    else c.arc(cx, (B / 2) * s, r * s, -Math.PI / 2, Math.PI / 2);
    c.stroke();
  });
  c.restore();
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ── The sign atlas ───────────────────────────────────────────────────────
   Posters, boards, plaques, exit signs and outlets all live on one texture,
   so every flat thing hung on every wall of a floor is a single draw call. */

const POSTER_WORDS = ['READ', 'SCIENCE', 'MATH', 'HISTORY', 'BE KIND', 'THINK', 'CREATE', 'TEAMWORK',
  'ART CLUB', 'ROBOTICS', 'SPIRIT WEEK', 'EXPLORE', 'CODE', 'DEBATE'];
const POSTER_BG = ['#1f4e79', '#8f1d22', '#2d6a4f', '#f2b134', '#5b3f8c', '#e76f51', '#264653', '#f4efe4', '#0f766e', '#b5179e'];

function fitText(c, text, x, y, maxW, px, color, weight = 800) {
  let size = px;
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) { size = Math.floor((size * maxW) / w); c.font = `${weight} ${size}px ${FONT}`; }
  c.fillStyle = color;
  c.fillText(text, x, y);
  return size;
}

function poster(c, w, h, i, R) {
  const bg = POSTER_BG[i % POSTER_BG.length];
  const light = bg === '#f4efe4' || bg === '#f2b134';
  const fg = light ? '#1b1f24' : '#ffffff';
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  const kind = i % 5;
  c.globalAlpha = 0.85;
  if (kind === 0) {           // mountain
    c.fillStyle = light ? '#1f4e79' : 'rgba(255,255,255,.35)';
    c.beginPath(); c.moveTo(0, h * 0.62); c.lineTo(w * 0.35, h * 0.3); c.lineTo(w * 0.55, h * 0.48); c.lineTo(w * 0.75, h * 0.25); c.lineTo(w, h * 0.62); c.fill();
  } else if (kind === 1) {    // atom
    c.strokeStyle = fg; c.lineWidth = 4;
    for (let k = 0; k < 3; k += 1) {
      c.save(); c.translate(w / 2, h * 0.38); c.rotate((k * Math.PI) / 3);
      c.beginPath(); c.ellipse(0, 0, w * 0.34, w * 0.12, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    }
  } else if (kind === 2) {    // bar chart
    c.fillStyle = fg;
    for (let k = 0; k < 6; k += 1) { const bh = h * (0.1 + R() * 0.35); c.fillRect(w * 0.12 + k * w * 0.13, h * 0.62 - bh, w * 0.09, bh); }
  } else if (kind === 3) {    // periodic-table grid
    for (let r = 0; r < 6; r += 1) {
      for (let k = 0; k < 9; k += 1) {
        if (r < 2 && k > 0 && k < 8) continue;
        c.fillStyle = hsl((k * 37 + r * 20) % 360, 55, 60);
        c.fillRect(w * 0.06 + k * w * 0.098, h * 0.12 + r * h * 0.075, w * 0.09, h * 0.068);
      }
    }
  } else {                    // circles
    for (let k = 0; k < 7; k += 1) {
      c.fillStyle = hsl(R() * 360, 60, 60, 0.8);
      c.beginPath(); c.arc(R() * w, R() * h * 0.6, 12 + R() * 34, 0, Math.PI * 2); c.fill();
    }
  }
  c.globalAlpha = 1;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  fitText(c, POSTER_WORDS[i % POSTER_WORDS.length], w / 2, h * 0.74, w * 0.86, 44, fg);
  c.fillStyle = light ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.55)';
  for (let k = 0; k < 3; k += 1) c.fillRect(w * 0.18, h * 0.84 + k * 10, w * (0.64 - R() * 0.2), 4);
}

function cork(c, w, h, R) {
  c.fillStyle = '#b5b8bb'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#b98d5a'; c.fillRect(8, 8, w - 16, h - 16);
  grain(c, w, h, 3000, ['#7a5530', '#d9b27f'], 2, 0.4, R);
  const n = 6 + Math.floor(R() * 5);
  for (let k = 0; k < n; k += 1) {
    const pw = 50 + R() * 70, ph = 60 + R() * 60;
    c.save(); c.translate(20 + R() * (w - 40 - pw) + pw / 2, 20 + R() * (h - 40 - ph) + ph / 2);
    c.rotate((R() - 0.5) * 0.12);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(-pw / 2 + 2, -ph / 2 + 3, pw, ph);
    c.fillStyle = pick(R, ['#ffffff', '#fff6a8', '#cfe8ff', '#ffd6e0', '#d9f2d0', '#ffffff']);
    c.fillRect(-pw / 2, -ph / 2, pw, ph);
    c.fillStyle = 'rgba(40,40,60,.55)';
    c.fillRect(-pw / 2 + 6, -ph / 2 + 8, pw * 0.6, 5);
    for (let l = 0; l < 4; l += 1) c.fillRect(-pw / 2 + 6, -ph / 2 + 20 + l * 9, pw * (0.5 + R() * 0.35), 2.5);
    c.fillStyle = pick(R, ['#d62828', '#1d4ed8', '#16a34a', '#f59e0b']);
    c.beginPath(); c.arc(0, -ph / 2 + 4, 4, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

const WB_LINES = [
  ['Agenda', '1. Warm-up', '2. Notes: ch. 7', '3. Lab groups'],
  ['HW: p. 142 #1-15', 'Quiz Thursday', 'y = mx + b'],
  ['Essay due Friday', 'Thesis → evidence', '→ analysis'],
  [],
];

function whiteboard(c, w, h, i, R) {
  c.fillStyle = '#f7f8f6'; c.fillRect(0, 0, w, h);
  grain(c, w, h, 900, ['#9aa3ad'], 3, 0.06, R);
  c.globalAlpha = 0.07; c.fillStyle = '#6b7c93';
  for (let k = 0; k < 6; k += 1) c.fillRect(R() * w, R() * h, 60 + R() * 120, 6 + R() * 10);
  c.globalAlpha = 1;
  c.textAlign = 'left'; c.textBaseline = 'top';
  const cols = ['#1d4ed8', '#111827', '#b91c1c', '#15803d'];
  (WB_LINES[i % WB_LINES.length]).forEach((line, k) => {
    c.font = `600 ${k === 0 ? 30 : 24}px "Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive`;
    c.fillStyle = cols[(k + i) % cols.length];
    c.fillText(line, 24 + (k ? 12 : 0), 18 + k * 36);
  });
  if (i === 1) {
    c.strokeStyle = '#1d4ed8'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(w * 0.62, h * 0.85); c.lineTo(w * 0.62, h * 0.15); c.moveTo(w * 0.55, h * 0.75); c.lineTo(w * 0.95, h * 0.75); c.stroke();
    c.strokeStyle = '#b91c1c'; c.beginPath(); c.moveTo(w * 0.58, h * 0.9); c.lineTo(w * 0.92, h * 0.25); c.stroke();
  }
}

function screen(c, w, h, i) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, i ? '#0f3b5f' : '#1d2b4a'); g.addColorStop(1, i ? '#12263b' : '#0c1424');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#8f1d22'; c.fillRect(0, 0, w, h * 0.18);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  fitText(c, i ? 'Welcome, class!' : 'IA NEXUS · TODAY', w * 0.05, h * 0.09, w * 0.9, h * 0.12, '#ffffff');
  c.fillStyle = 'rgba(255,255,255,.75)';
  for (let k = 0; k < 4; k += 1) c.fillRect(w * 0.06, h * (0.32 + k * 0.14), w * (0.7 - k * 0.1), h * 0.05);
  c.fillStyle = '#f2b134'; c.fillRect(w * 0.8, h * 0.3, w * 0.14, w * 0.14);
}

function plaque(c, w, h, text) {
  c.fillStyle = '#2b2f35'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#8b9096'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  fitText(c, text, w / 2, h * 0.42, w * 0.86, h * 0.46, '#f4f4f2');
  c.fillStyle = '#c9ccd0';
  for (let k = 0; k < 8; k += 1) {
    c.beginPath(); c.arc(w / 2 - 28 + k * 8, h * 0.8, 2, 0, Math.PI * 2); c.fill();
  }
}

function evac(c, w, h, plan, n) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#b91c1c'; c.fillRect(0, 0, w, 26);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  fitText(c, `EVACUATION PLAN · FLOOR ${n}`, w / 2, 13, w - 16, 15, '#ffffff');
  const b = plan.bbox;
  const sc = Math.min((w - 16) / (b.x2 - b.x1 + 60), (h - 40) / (b.y2 - b.y1 + 60));
  const X = (x) => 8 + (x - b.x1 + 30) * sc, Y = (y) => 32 + (y - b.y1 + 30) * sc;
  c.fillStyle = '#dfe6ec';
  plan.HALLS.forEach((q) => c.fillRect(X(q.x1), Y(q.y1), (q.x2 - q.x1) * sc, (q.y2 - q.y1) * sc));
  c.strokeStyle = '#4b5563'; c.lineWidth = 1;
  plan.ROOMS.forEach((r) => c.strokeRect(X(r.rect.x1), Y(r.rect.y1), (r.rect.x2 - r.rect.x1) * sc, (r.rect.y2 - r.rect.y1) * sc));
  c.fillStyle = '#16a34a';
  plan.STAIRS.forEach((s) => c.fillRect(X(s.rect.x1), Y(s.rect.y1), (s.rect.x2 - s.rect.x1) * sc, (s.rect.y2 - s.rect.y1) * sc));
}

let atlasCache = null;

export function makeAtlas(THREE, plans, maxAniso = 8) {
  if (!atlasCache) atlasCache = paintAtlas(plans);
  const t = new THREE.CanvasTexture(atlasCache.el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  const { map } = atlasCache;
  return { tex: t, uv: (k) => map[k] || map.poster0 };
}

function paintAtlas(plans) {
  const W = 2048, H = 3072;
  const [el, c] = canvas(W, H);
  let x = 0, y = 0, rowH = 0;
  const map = {};
  const R = rng(4242);
  const add = (key, w, h, draw) => {
    if (map[key]) return;
    if (x + w + 6 > W) { x = 0; y += rowH + 6; rowH = 0; }
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y);
    draw(c, w, h); c.restore();
    const e = 0.5;
    map[key] = { u0: (x + e) / W, u1: (x + w - e) / W, v0: 1 - (y + h - e) / H, v1: 1 - (y + e) / H };
    x += w + 6; rowH = Math.max(rowH, h);
  };

  for (let i = 0; i < 14; i += 1) add(`poster${i}`, 200, 280, (cc, w, h) => poster(cc, w, h, i, R));
  for (let i = 0; i < 4; i += 1) add(`cork${i}`, 400, 240, (cc, w, h) => cork(cc, w, h, R));
  for (let i = 0; i < 4; i += 1) add(`wb${i}`, 512, 192, (cc, w, h) => whiteboard(cc, w, h, i, R));
  for (let i = 0; i < 2; i += 1) add(`tv${i}`, 256, 144, (cc, w, h) => screen(cc, w, h, i));
  add('clock', 96, 96, (cc) => {
    cc.fillStyle = '#ffffff'; cc.beginPath(); cc.arc(48, 48, 44, 0, Math.PI * 2); cc.fill();
    cc.strokeStyle = '#1f2328'; cc.lineWidth = 6; cc.stroke();
    cc.fillStyle = '#1f2328';
    for (let k = 0; k < 12; k += 1) { cc.save(); cc.translate(48, 48); cc.rotate((k * Math.PI) / 6); cc.fillRect(-1.5, -38, 3, 7); cc.restore(); }
    cc.lineWidth = 4; cc.beginPath(); cc.moveTo(48, 48); cc.lineTo(48 + 16, 48 - 12); cc.moveTo(48, 48); cc.lineTo(48 - 4, 48 - 30); cc.stroke();
  });
  add('exit', 128, 56, (cc, w, h) => {
    cc.fillStyle = '#f7f7f4'; cc.fillRect(0, 0, w, h);
    cc.textAlign = 'center'; cc.textBaseline = 'middle';
    cc.shadowColor = '#ff3b3b'; cc.shadowBlur = 8;
    fitText(cc, 'EXIT', w / 2, h / 2 + 2, w * 0.8, 40, '#e11d1d', 900);
  });
  add('extSign', 64, 96, (cc, w, h) => {
    cc.fillStyle = '#c81e1e'; cc.fillRect(0, 0, w, h);
    cc.fillStyle = '#ffffff'; cc.fillRect(w / 2 - 8, 20, 16, 44); cc.fillRect(w / 2 - 4, 12, 8, 10);
    cc.textAlign = 'center'; cc.textBaseline = 'middle';
    fitText(cc, 'FIRE', w / 2, 76, w - 8, 13, '#ffffff');
    fitText(cc, 'EXTINGUISHER', w / 2, 88, w - 6, 10, '#ffffff');
  });
  add('outlet', 32, 52, (cc, w, h) => {
    cc.fillStyle = '#ece7da'; cc.fillRect(0, 0, w, h);
    cc.fillStyle = '#3a3a3a';
    [14, 34].forEach((yy) => { cc.fillRect(10, yy - 5, 3, 8); cc.fillRect(19, yy - 5, 3, 8); cc.fillRect(15, yy + 5, 2, 3); });
  });
  add('switch', 32, 52, (cc, w, h) => {
    cc.fillStyle = '#ece7da'; cc.fillRect(0, 0, w, h);
    cc.fillStyle = '#d6d0c2'; cc.fillRect(12, 18, 8, 16);
  });

  const names = new Set();
  const stairs = new Set();
  Object.values(plans).forEach((p) => {
    p.ROOMS.forEach((r) => names.add(r.name));
    p.STAIRS.forEach((s) => { names.add(s.name.toUpperCase()); stairs.add(s.name); });
  });
  names.forEach((n) => add(`plaque:${n}`, 192, 72, (cc, w, h) => plaque(cc, w, h, n.toUpperCase())));
  stairs.forEach((s) => ['L', 'R'].forEach((d) => add(`dir:${s}:${d}`, 320, 64, (cc, w, h) => {
    cc.fillStyle = '#1d3557'; cc.fillRect(0, 0, w, h);
    cc.fillStyle = '#16a34a'; cc.fillRect(0, 0, 70, h);
    cc.textAlign = 'center'; cc.textBaseline = 'middle';
    fitText(cc, 'EXIT', 35, h / 2, 60, 22, '#ffffff', 900);
    const label = d === 'L' ? `← ${s.toUpperCase()}` : `${s.toUpperCase()} →`;
    fitText(cc, label, 70 + (w - 70) / 2, h / 2, w - 90, 30, '#ffffff');
  })));
  Object.keys(plans).forEach((n) => add(`evac:${n}`, 256, 180, (cc, w, h) => evac(cc, w, h, plans[n], n)));

  return { el, map };
}
