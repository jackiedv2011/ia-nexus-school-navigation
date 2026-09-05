'use strict';

// Tests for the behaviour that decides what the bell feels like, and what
// happens when someone is not a student.
//
// The bell is this app's defining load event: every student in the building
// opens it inside the same few seconds, from a single NAT address, and the
// schedule page asks for a route automatically. These lock in the properties
// that make that survivable.
//
// Runs the real server with `db` stubbed, so it needs no Postgres and runs in
// CI like everything else.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const net = require('node:net');

const BACKEND = path.join(__dirname, '..');
const PORT = 3874;
const BASE = `http://localhost:${PORT}`;

// Counts every query the server makes, so a test can prove the database is NOT
// being touched on the hot path.
const HARNESS = `
const dbPath = require.resolve(${JSON.stringify(path.join(BACKEND, 'db.js'))});
let queries = [];
let failing = false;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  get: async (sql, ...p) => {
    queries.push(sql.trim().split('\\n')[0].slice(0, 60));
    if (failing) throw new Error('database is down');
    if (/rate_limits/.test(sql)) return { count: 1, reset_at: new Date(Date.now() + 60000).toISOString() };
    return { n: 0 };
  },
  all: async (sql) => { queries.push(sql.trim().slice(0, 40)); if (failing) throw new Error('database is down'); return []; },
  run: async (sql) => { queries.push(sql.trim().split('\\n')[0].slice(0, 60)); if (failing) throw new Error('database is down'); return { changes: 1, rows: [] }; },
  init: async () => {}, close: async () => {}, query: async () => ({ rows: [] }),
  pool: {}, SCHEMA: 'public',
}};
process.on('message', (m) => {
  if (m === 'queries') { process.send({ queries: queries.slice() }); queries = []; }
  if (m === 'fail') { failing = true; process.send({ ok: true }); }
  if (m === 'heal') { failing = false; process.send({ ok: true }); }
});
require(${JSON.stringify(path.join(BACKEND, 'server.js'))});
`;

const harnessFile = path.join(os.tmpdir(), `ia-resilience-${process.pid}.js`);
let server;

function ask(msg) {
  return new Promise((resolve) => { server.once('message', resolve); server.send(msg); });
}

const route = (body = { fromRoom: '188', fromFloor: 1, toRoom: '331', toFloor: 3 }) =>
  fetch(`${BASE}/api/route`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

before(async () => {
  fs.writeFileSync(harnessFile, HARNESS);
  server = spawn(process.execPath, [harnessFile], {
    env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'resilience-test', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('boot timeout')), 12000);
    server.stdout.on('data', (d) => {
      if (d.toString().includes('running at')) { clearTimeout(to); resolve(); }
    });
    server.stderr.on('data', () => {});
    server.on('exit', (c) => { clearTimeout(to); reject(new Error('exited ' + c)); });
  });
});

after(() => {
  server?.kill('SIGKILL');
  try { fs.unlinkSync(harnessFile); } catch { /* gone */ }
});

// ─── The route cache ──────────────────────────────────────────────────────────

// Routing was 1.2ms of single-threaded CPU per request. At 1,500 simultaneous
// requests that is 1.7s of CPU with nothing else able to run, which is what
// made bell-time latency seconds rather than milliseconds.
test('the same route is computed once, however many times it is asked for', () => {
  const { findPath, routeCacheStats } = require('../data/roomCoordinates');
  const before = routeCacheStats();
  const first = findPath('188', 1, '331', 3);
  const afterFirst = routeCacheStats();

  const t0 = performance.now();
  for (let i = 0; i < 2000; i++) findPath('188', 1, '331', 3);
  const elapsed = performance.now() - t0;
  const after = routeCacheStats();

  assert.strictEqual(after.misses, afterFirst.misses, '2000 repeats must add no cache misses');
  assert.ok(after.hits >= before.hits + 2000);
  assert.ok(elapsed < 200, `2000 cached lookups took ${Math.round(elapsed)}ms; expected well under 200ms`);
  assert.strictEqual(findPath('188', 1, '331', 3), first, 'the identical object is returned');
});

test('a cached route cannot be mutated by one caller and corrupted for the next', () => {
  const { findPath } = require('../data/roomCoordinates');
  const r = findPath('188', 1, '192', 1);
  assert.ok(Object.isFrozen(r), 'the result must be frozen');
  assert.ok(Object.isFrozen(r.path1), 'the path must be frozen');
  assert.throws(() => { 'use strict'; r.path1.push([0, 0]); });
  assert.strictEqual(findPath('188', 1, '192', 1).path1.length, r.path1.length);
});

test('different questions get different answers (the cache key is complete)', () => {
  const { findPath } = require('../data/roomCoordinates');
  const a = findPath('188', 1, '331', 3);
  const b = findPath('331', 3, '188', 1);
  const c = findPath('188', 1, '192', 1);
  assert.notStrictEqual(a, b, 'reversing the trip is a different route');
  assert.notStrictEqual(a, c);
  assert.deepStrictEqual(a.path1[0], [284, 431]);
  assert.notDeepStrictEqual(b.path1[0], a.path1[0]);
});

test('the cache is bounded and evicts rather than growing forever', () => {
  const { findPath, routeCacheStats } = require('../data/roomCoordinates');
  const { max } = routeCacheStats();
  // Ask far more distinct questions than the cache can hold.
  for (let i = 0; i < max + 500; i++) findPath(`nonexistent-${i}`, 1, '331', 3);
  assert.ok(routeCacheStats().size <= max, `cache grew to ${routeCacheStats().size}, past its ${max} ceiling`);
});

// ─── Rate limiting off the hot path ───────────────────────────────────────────

test('the per-IP limiter does not query the database on every request', async () => {
  await ask('queries');                       // clear
  for (let i = 0; i < 25; i++) await route();
  const { queries } = await ask('queries');
  const rateLimitQueries = queries.filter(q => /rate_limits/.test(q));
  assert.strictEqual(rateLimitQueries.length, 0,
    `25 requests caused ${rateLimitQueries.length} rate_limits queries; counting must happen in memory `
    + '(the whole school shares one IP, so every request would contend on one row)');
});

// The route finder and guest chat need no user data at all. Before, a limiter
// that could not reach Postgres returned 503 and took them down with it.
test('the route finder keeps working while the database is down', async () => {
  await ask('fail');
  try {
    const res = await route();
    assert.strictEqual(res.status, 200, 'a route needs no database and must still be served');
    const body = await res.json();
    assert.ok(body.path1.length >= 2);
  } finally {
    await ask('heal');
  }
});

test('the health check still reports the database being down', async () => {
  // Let any cached health result expire first.
  await new Promise(r => setTimeout(r, 5200));
  await ask('fail');
  try {
    const res = await fetch(`${BASE}/api/health`);
    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
  } finally {
    await ask('heal');
    await new Promise(r => setTimeout(r, 5200));
  }
});

// ─── The health check as an amplification vector ──────────────────────────────

test('hammering /api/health does not hammer the database', async () => {
  await fetch(`${BASE}/api/health`);          // prime the cache
  await ask('queries');                       // clear
  await Promise.all(Array.from({ length: 200 }, () => fetch(`${BASE}/api/health`)));
  const { queries } = await ask('queries');
  assert.ok(queries.length <= 2,
    `200 health checks ran ${queries.length} queries; the probe must be cached, or this endpoint `
    + 'is a free way for anyone to exhaust the connection pool');
});

// ─── Caching, which is what the bell actually costs ───────────────────────────

test('content-hashed assets are cached for a year; mutable ones are not', () => {
  // The real rule the server applies, not a copy of it.
  const { cacheControlFor } = require('../staticCache');
  const cases = [
    ['/app/frontend/dist/assets/index-B_3blE.js', 'public, max-age=31536000, immutable'],
    ['/app/frontend/dist/assets/index-CysM.css', 'public, max-age=31536000, immutable'],
    ['/app/frontend/dist/fonts/UcC73Fwr.woff2', 'public, max-age=31536000, immutable'],
    ['/app/frontend/dist/fonts/fonts.css', 'public, max-age=31536000, immutable'],
    // NOT content-hashed: a corrected floor plan has to be able to reach people.
    ['/app/frontend/dist/maps/floor1.png', 'public, max-age=3600, must-revalidate'],
    ['/app/frontend/dist/phoenix.png', 'public, max-age=3600, must-revalidate'],
    // The shell names the current hashes, so it must never be stale.
    ['/app/frontend/dist/index.html', 'no-cache'],
  ];
  for (const [file, expected] of cases) {
    assert.strictEqual(cacheControlFor(file), expected, `wrong cache policy for ${file}`);
  }
});

test('a Windows-style path gets the same policy as a POSIX one', () => {
  const { cacheControlFor } = require('../staticCache');
  assert.match(cacheControlFor('C:\\app\\dist\\assets\\index-abc.js'), /immutable/);
  assert.match(cacheControlFor('C:\\app\\dist\\maps\\floor1.png'), /must-revalidate/);
});

// ─── Load shedding ────────────────────────────────────────────────────────────

test('a burst far larger than a bell is served, not dropped', async () => {
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: 1500 }, () => route().catch(() => null)));
  const elapsed = performance.now() - t0;
  const ok = results.filter(r => r && r.status === 200).length;
  await Promise.all(results.map(r => r && r.text().catch(() => {})));

  assert.strictEqual(ok, 1500, `${1500 - ok} of 1500 bell-time requests were not served`);
  assert.ok(elapsed < 15000, `1500 concurrent requests took ${Math.round(elapsed)}ms`);
});

// ─── Slowloris ────────────────────────────────────────────────────────────────

// A client that opens a socket, sends half a request, and then goes quiet costs
// the attacker nothing and holds a server connection forever on Node's
// defaults. Two things about the fix are easy to get wrong, and both were until
// a real slowloris was run against it:
//   * the timeouts must be passed to http.createServer, not assigned to the
//     server afterwards — otherwise they are only checked every
//     connectionsCheckingInterval, which defaults to 30 seconds;
//   * headersTimeout must be <= requestTimeout, not the other way round.
// Assigning them the wrong way round fails silently, which is why this is a
// behavioural test against a live socket rather than an assertion about config.
test('half-open connections are closed by the server, not left to accumulate', async () => {
  const N = 20;
  const t0 = performance.now();
  let closed = 0, got408 = 0;
  let healthDuringAttack = null;

  await new Promise((done) => {
    const finish = () => { if (++closed === N) done(); };
    for (let i = 0; i < N; i++) {
      const s = net.connect(PORT, '127.0.0.1', () => {
        s.write('GET / HTTP/1.1\r\nHost: x\r\n');   // headers deliberately unfinished
      });
      s.on('data', (d) => { if (d.toString().includes('408')) got408++; });
      s.on('close', finish);
      s.on('error', finish);
    }
    // The server must keep serving real traffic while they are held open.
    setTimeout(async () => {
      const r = await fetch(`${BASE}/api/health`).catch(() => ({ status: 0 }));
      healthDuringAttack = r.status;
    }, 500);
    setTimeout(done, 40_000);          // fail loudly rather than hang
  });

  const seconds = (performance.now() - t0) / 1000;
  assert.strictEqual(closed, N,
    `${N - closed} of ${N} half-open sockets were never closed — they leak, and a few hundred `
    + 'of them is a denial of service that costs the attacker nothing');
  assert.ok(seconds < 25, `sockets took ${seconds.toFixed(1)}s to be reaped; expected ~15s`);
  assert.ok(got408 > 0, 'the server should answer 408 Request Timeout, not just hang up');
  assert.ok(healthDuringAttack === 200 || healthDuringAttack === 503,
    `the server stopped answering during the attack (health returned ${healthDuringAttack})`);
});

test('the health check is never shed, so the platform can still see the process', async () => {
  const res = await fetch(`${BASE}/api/health`);
  assert.ok(res.status === 200 || res.status === 503, `health returned ${res.status}`);
});
