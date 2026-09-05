// Storage that can't take a page down with it.
//
// localStorage and sessionStorage are not always available, and the failure is
// not "returns null" — the ACCESSOR ITSELF THROWS. That happens for real users,
// not just in theory: Safari private browsing, "block all cookies" / third-party
// cookie blocking when the app is framed, some Android and iOS in-app webviews,
// enterprise browser policies, and a full quota on write.
//
// An unguarded read at the top of a component turns that into a blank white
// page. Everything the app puts in storage is a convenience — the session
// token is the only load-bearing value, and losing it degrades to "signed out",
// which is a recoverable state. So every accessor here fails soft.
//
// Use these instead of touching window.localStorage directly.

function backend(session) {
  try {
    return session ? window.sessionStorage : window.localStorage;
  } catch {
    // Even READING the property throws when storage is disabled by policy.
    return null;
  }
}

/** Reads a string, or null if absent or storage is unavailable. */
export function readStored(key, { session = false } = {}) {
  const store = backend(session);
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Writes a string. Returns true if it stuck, false if storage refused it. */
export function writeStored(key, value, { session = false } = {}) {
  const store = backend(session);
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Removes a key. Never throws, even if it was never there. */
export function removeStored(key, { session = false } = {}) {
  const store = backend(session);
  if (!store) return;
  try {
    store.removeItem(key);
  } catch { /* nothing to do — it is already unreachable */ }
}

/**
 * Reads and JSON-parses a value. Returns `fallback` when the key is absent,
 * storage is unavailable, or the stored text isn't valid JSON — which happens
 * with a truncated write, hand-edited storage, or data from an older version of
 * the app.
 */
export function readStoredJson(key, fallback, options) {
  const raw = readStored(key, options);
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/** JSON-stringifies and writes. Returns true if it stuck. */
export function writeStoredJson(key, value, options) {
  try {
    return writeStored(key, JSON.stringify(value), options);
  } catch {
    // JSON.stringify throws on circular structures. Nothing this app stores is
    // circular, but a storage helper should not be the thing that crashes.
    return false;
  }
}
