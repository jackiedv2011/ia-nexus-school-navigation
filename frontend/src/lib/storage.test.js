import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readStored, writeStored, removeStored, readStoredJson, writeStoredJson } from './storage';

// The whole point of this module is that it survives browsers where storage is
// unavailable, so most of these tests are about what happens when it throws.

function installStorage(impl) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      if (impl === 'throws-on-access') throw new DOMException('SecurityError');
      return impl;
    },
  });
}

const realLocalStorage = window.localStorage;

afterEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: realLocalStorage,
  });
  vi.restoreAllMocks();
});

describe('when storage works normally', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a string', () => {
    expect(writeStored('k', 'v')).toBe(true);
    expect(readStored('k')).toBe('v');
  });

  it('returns null for a key that was never set', () => {
    expect(readStored('nope')).toBe(null);
  });

  it('removes a key', () => {
    writeStored('k', 'v');
    removeStored('k');
    expect(readStored('k')).toBe(null);
  });

  it('removing a missing key is a no-op, not an error', () => {
    expect(() => removeStored('never-existed')).not.toThrow();
  });

  it('round-trips JSON', () => {
    writeStoredJson('obj', { a: 1, b: [2, 3] });
    expect(readStoredJson('obj', null)).toEqual({ a: 1, b: [2, 3] });
  });

  it('keeps sessionStorage separate from localStorage', () => {
    writeStored('same-key', 'local');
    writeStored('same-key', 'session', { session: true });
    expect(readStored('same-key')).toBe('local');
    expect(readStored('same-key', { session: true })).toBe('session');
  });
});

describe('when the stored value is unusable', () => {
  beforeEach(() => window.localStorage.clear());

  it('falls back when the stored text is not valid JSON', () => {
    window.localStorage.setItem('bad', '{not json');
    expect(readStoredJson('bad', 'fallback')).toBe('fallback');
  });

  it('falls back when the stored text is a truncated array', () => {
    window.localStorage.setItem('bad', '[{"a":1},{"b"');
    expect(readStoredJson('bad', [])).toEqual([]);
  });

  it('falls back on a literal stored null rather than returning null', () => {
    window.localStorage.setItem('n', 'null');
    expect(readStoredJson('n', 'fallback')).toBe('fallback');
  });

  it('returns whatever JSON type was stored, including a wrong one', () => {
    // Callers are responsible for shape-checking; this only guarantees no throw.
    window.localStorage.setItem('num', '42');
    expect(readStoredJson('num', [])).toBe(42);
  });
});

describe('when storage is blocked by the browser', () => {
  it('reads return null when accessing the property itself throws', () => {
    installStorage('throws-on-access');
    expect(readStored('k')).toBe(null);
    expect(readStoredJson('k', 'fallback')).toBe('fallback');
  });

  it('writes report failure instead of throwing when the property throws', () => {
    installStorage('throws-on-access');
    expect(writeStored('k', 'v')).toBe(false);
    expect(writeStoredJson('k', { a: 1 })).toBe(false);
    expect(() => removeStored('k')).not.toThrow();
  });

  it('reads return null when getItem throws', () => {
    installStorage({
      getItem: () => { throw new DOMException('SecurityError'); },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readStored('k')).toBe(null);
  });

  it('writes report failure when the quota is exceeded', () => {
    installStorage({
      getItem: () => null,
      setItem: () => { throw new DOMException('QuotaExceededError'); },
      removeItem: () => {},
    });
    expect(writeStored('k', 'v')).toBe(false);
  });

  it('removes swallow a throwing removeItem', () => {
    installStorage({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => { throw new DOMException('SecurityError'); },
    });
    expect(() => removeStored('k')).not.toThrow();
  });
});

describe('writeStoredJson with unserializable input', () => {
  it('reports failure rather than throwing on a circular structure', () => {
    const circular = {};
    circular.self = circular;
    expect(writeStoredJson('c', circular)).toBe(false);
  });
});
