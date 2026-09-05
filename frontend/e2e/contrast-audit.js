// The WCAG contrast audit, run inside the page.
//
// Walks every element that renders text, works out the background it is
// ACTUALLY painted on (climbing ancestors through transparent backgrounds and
// compositing alpha), and reports anything under the AA threshold — 4.5:1, or
// 3:1 for large text.
//
// Shared by the Playwright spec (which gates CI) and by the standalone
// `npm run check:contrast` script, so the two can never disagree.
export const AUDIT = () => {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s);
    return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const over = (fg, bg) => (fg.a >= 1 ? fg.c : fg.c.map((v, i) => v * fg.a + bg[i] * (1 - fg.a)));
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const pageBg = (() => {
    const h = parse(getComputedStyle(document.documentElement).backgroundColor);
    const b = parse(getComputedStyle(document.body).backgroundColor);
    if (b && b.a > 0) return over(b, [255, 255, 255]);
    if (h && h.a > 0) return over(h, [255, 255, 255]);
    return [255, 255, 255];
  })();

  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (p && p.a > 0) return over(p, pageBg);
      n = n.parentElement;
    }
    return pageBg;
  };

  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const size = parseFloat(cs.fontSize);
    const weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const cr = ratio(over(fg, bg), bg);
    if (cr < need) {
      out.push({
        text: text.slice(0, 44),
        cls: (el.className || '').toString().slice(0, 30),
        color: cs.color,
        bg: `rgb(${bg.map(Math.round).join(',')})`,
        ratio: +cr.toFixed(2),
        need,
        size: Math.round(size),
        weight,
      });
    }
  }
  return out;
};
