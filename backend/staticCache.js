'use strict';

// How long a browser may keep each kind of file we serve.
//
// This is the single biggest thing that decides what the bell feels like. Every
// student in the building opens the app within the same few seconds; if their
// browser has to re-fetch — or even just re-validate — the JS bundle, the floor
// plans and the fonts each time, that is thousands of simultaneous requests for
// bytes that have not changed. Everything used to be served with `max-age=0`,
// so it did exactly that: measured, a repeat visit cost the server 7 requests
// and ~450 KB. With the policy below it costs 1 request and ~1 KB.
//
// Lives in its own module so the tests can check the real rule rather than a
// copy of it.

const ONE_YEAR = 365 * 24 * 60 * 60;
const ONE_HOUR = 60 * 60;

// Vite writes a content hash into the filename of everything under assets/, and
// the self-hosted fonts carry the upstream hash in theirs. A change to any of
// them produces a NEW filename, so the old one can be kept forever — and
// `immutable` tells the browser not to bother revalidating either.
const HASHED_DIR = /[\\/](assets|fonts)[\\/]/;

/**
 * The Cache-Control value for one file being served out of the build.
 * @param {string} filePath absolute or relative path of the file on disk
 */
function cacheControlFor(filePath) {
  if (HASHED_DIR.test(filePath)) {
    return `public, max-age=${ONE_YEAR}, immutable`;
  }
  if (filePath.endsWith('.html')) {
    // The shell names the current asset hashes, so it must never be stale —
    // otherwise a deploy leaves browsers asking for files that are gone.
    return 'no-cache';
  }
  // Floor plans and the logo are NOT content-hashed, so they have to stay
  // refreshable: a corrected map must reach students. An hour is long enough
  // that the bell is still a cache hit.
  return `public, max-age=${ONE_HOUR}, must-revalidate`;
}

module.exports = { cacheControlFor, ONE_YEAR, ONE_HOUR };
