import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function cssModules(dir = SRC, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) cssModules(full, found);
    else if (entry.endsWith('.module.css')) found.push(full);
  }
  return found;
}

// Collect the class names declared by TOP-LEVEL single-class rules.
//
// Rules inside @media / @supports are skipped deliberately: redeclaring a class
// there is the normal way to write a responsive override, and is not a
// collision. Only two top-level `.foo { }` blocks in one file are — the second
// silently wins.
function topLevelClassSelectors(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = [];
  let depth = 0;
  let buffer = '';

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) {
        const selector = buffer.trim();
        const atRule = selector.startsWith('@');
        // An at-rule opens a nested context whose inner rules we skip; a normal
        // selector opens a declaration block we also skip. Either way, descend.
        if (!atRule) {
          const solo = selector.match(/^\.([A-Za-z0-9_-]+)$/);
          if (solo) names.push(solo[1]);
          // Skip straight past this declaration block so its contents are never
          // mistaken for selectors.
          let d = 1;
          while (++i < src.length && d > 0) {
            if (src[i] === '{') d++;
            else if (src[i] === '}') d--;
          }
          i--;
          buffer = '';
          continue;
        }
      }
      depth++;
      buffer = '';
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  return names;
}

describe('CSS modules', () => {
  const files = cssModules();

  it('finds the stylesheets to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  // The bug this exists for: Admin.module.css declared `.bar` twice — once for
  // the page's top bar, once for a bar in the usage chart. CSS modules hash by
  // class NAME, so both compiled to the same class and the later rule won,
  // painting the header red-on-red with its own brand text invisible. Nothing
  // warned; it was only caught by looking at a screenshot.
  for (const file of files) {
    it(`${relative(SRC, file)} declares each class exactly once`, () => {
      const names = topLevelClassSelectors(readFileSync(file, 'utf8'));
      const seen = new Set();
      const duplicated = new Set();
      for (const n of names) {
        if (seen.has(n)) duplicated.add(n);
        seen.add(n);
      }
      expect([...duplicated],
        `these class names are declared more than once in the same file, so the `
        + `later rule silently overrides the earlier one`).toEqual([]);
    });
  }
});
