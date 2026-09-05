'use strict';

// Integration tests for the admin dashboard API.
//
// These boot the REAL server.js — the real middleware chain, the real route
// handlers — with only the `db` module replaced by an in-memory stub. That is
// what lets them run in CI, where no DATABASE_URL is configured, while still
// exercising the actual authorization path rather than a re-implementation of
// it (which is the weakness of a hand-rolled test double).
//
// Each test runs the server in a CHILD PROCESS on its own port, because
// server.js reads ADMIN_KEY once at module load and calls process.exit on a
// fatal error — neither of which can be undone inside one process.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ADMIN_KEY = 'test-admin-key-0123456789';
const PORT_WITH_KEY = 3894;
const PORT_NO_KEY = 3895;

// A launcher script that stubs ./db before requiring the server.
const HARNESS = `
const dbPath = require.resolve(${JSON.stringify(path.join(__dirname, '..', 'db.js'))});
const auditWrites = [];
const captured = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  get: async (sql) => {
    if (/rate_limits/.test(sql)) return { count: 1, reset_at: new Date(Date.now() + 60000).toISOString() };
    if (/AVG\\(rating\\)/.test(sql)) return { avg: '4.20' };
    if (/COUNT\\(\\*\\)/.test(sql)) return { n: 3 };
    return {};
  },
  all: async (sql, ...params) => {
    captured.push({ sql, params });
    if (/GROUP BY day/.test(sql)) return [{ day: '2026-09-04', n: 2 }];
    if (/GROUP BY mode/.test(sql)) return [{ mode: 'rule', n: 3 }];
    // Return exactly as many rows as the LIMIT asks for, so hasMore can be
    // exercised, capped at a small number so the tests stay fast.
    const limit = Math.min(params[0] ?? 0, 3);
    return Array.from({ length: limit }, (_, i) => ({ id: i + 1, created_at: new Date().toISOString() }));
  },
  run: async (sql, ...params) => {
    if (/admin_audit_log/.test(sql)) auditWrites.push(params);
    return { changes: 1, rows: [] };
  },
  init: async () => {}, close: async () => {}, query: async () => ({ rows: [] }),
  pool: {}, SCHEMA: 'public',
}};
// A back channel for assertions about what the server asked the database.
process.on('message', (m) => {
  if (m === 'audit') process.send({ auditWrites });
  if (m === 'captured') process.send({ captured });
});
require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});
`;

const harnessFile = path.join(os.tmpdir(), `ia-admin-harness-${process.pid}.js`);
let withKey, noKey;

function boot(port, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [harnessFile], {
      env: { ...process.env, PORT: String(port), JWT_SECRET: 'test', NODE_ENV: 'test', ...env },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const to = setTimeout(() => reject(new Error(`server on ${port} did not boot`)), 10000);
    proc.stdout.on('data', (d) => {
      if (d.toString().includes('running at')) { clearTimeout(to); resolve(proc); }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', (c) => { clearTimeout(to); reject(new Error(`server on ${port} exited early (${c})`)); });
  });
}

async function get(port, pathname, key) {
  const res = await fetch(`http://localhost:${port}${pathname}`, {
    headers: key === undefined ? {} : { 'x-admin-key': key },
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, contentType: (res.headers.get('content-type') || '').split(';')[0] };
}

function ask(proc, what) {
  return new Promise((resolve) => {
    proc.once('message', resolve);
    proc.send(what);
  });
}

before(async () => {
  fs.writeFileSync(harnessFile, HARNESS);
  // ADMIN_KEY explicitly cleared on the second instance: an unset key must
  // disable the dashboard, not leave it open.
  [withKey, noKey] = await Promise.all([
    boot(PORT_WITH_KEY, { ADMIN_KEY }),
    boot(PORT_NO_KEY, { ADMIN_KEY: '' }),
  ]);
});

after(() => {
  withKey?.kill('SIGKILL');
  noKey?.kill('SIGKILL');
  try { fs.unlinkSync(harnessFile); } catch { /* already gone */ }
});

const ENDPOINTS = [
  '/api/admin/stats',
  '/api/admin/questions',
  '/api/admin/flagged',
  '/api/admin/feedback',
  '/api/admin/audit-log',
  '/api/admin/security-events',
];

test('every admin endpoint answers with the correct key', async () => {
  for (const p of ENDPOINTS) {
    const res = await get(PORT_WITH_KEY, p, ADMIN_KEY);
    assert.strictEqual(res.status, 200, `${p} returned ${res.status}`);
    assert.strictEqual(res.contentType, 'application/json', `${p} did not return JSON`);
  }
});

test('every admin endpoint rejects a missing, wrong, or empty key', async () => {
  const badKeys = [
    undefined,                       // no header at all
    '',                              // empty
    'wrong',                         // wrong, different length
    'x'.repeat(ADMIN_KEY.length),    // wrong, SAME length (exercises timingSafeEqual)
    ADMIN_KEY + 'x',                 // right prefix, longer
    ADMIN_KEY.slice(0, -1),          // right prefix, shorter
  ];
  for (const p of ENDPOINTS) {
    for (const key of badKeys) {
      const res = await get(PORT_WITH_KEY, p, key);
      assert.strictEqual(res.status, 401,
        `${p} with key ${JSON.stringify(key)} returned ${res.status}, not 401`);
      assert.deepStrictEqual(res.json, { error: 'Unauthorized' });
    }
  }
});

// A same-length wrong key is the case a naive `===` would still reject but a
// length check alone would not — this pins the constant-time comparison down.
test('a same-length wrong key does not crash timingSafeEqual', async () => {
  const res = await get(PORT_WITH_KEY, '/api/admin/stats', 'y'.repeat(ADMIN_KEY.length));
  assert.strictEqual(res.status, 401);
});

test('with no ADMIN_KEY configured the dashboard is closed, not open', async () => {
  for (const key of [undefined, '', 'anything', ADMIN_KEY]) {
    const res = await get(PORT_NO_KEY, '/api/admin/stats', key);
    assert.strictEqual(res.status, 401,
      `unset ADMIN_KEY should reject key ${JSON.stringify(key)}, got ${res.status}`);
  }
});

test('every attempt is written to the audit log, successful or not', async () => {
  const before = (await ask(withKey, 'audit')).auditWrites.length;
  await get(PORT_WITH_KEY, '/api/admin/feedback', ADMIN_KEY);
  await get(PORT_WITH_KEY, '/api/admin/feedback', 'wrong');
  // The audit write is fire-and-forget, so give it a tick to land.
  await new Promise(r => setTimeout(r, 150));
  const writes = (await ask(withKey, 'audit')).auditWrites.slice(before);
  assert.strictEqual(writes.length, 2, 'both the allowed and the rejected attempt should be logged');
  assert.strictEqual(writes[0][2], 1, 'the allowed attempt is recorded as success');
  assert.strictEqual(writes[1][2], 0, 'the rejected attempt is recorded as failure');
  assert.ok(writes.every(w => w[1] === '/api/admin/feedback'), 'the path is recorded');
});

test('page size is clamped and offset cannot go negative', async () => {
  const before = (await ask(withKey, 'captured')).captured.length;
  await get(PORT_WITH_KEY, '/api/admin/questions?limit=99999&offset=-5', ADMIN_KEY);
  await get(PORT_WITH_KEY, '/api/admin/questions?limit=0', ADMIN_KEY);
  await get(PORT_WITH_KEY, '/api/admin/questions?limit=abc&offset=xyz', ADMIN_KEY);
  const calls = (await ask(withKey, 'captured')).captured.slice(before)
    .filter(c => /LIMIT/.test(c.sql));
  assert.strictEqual(calls.length, 3);
  for (const c of calls) {
    const [limit, offset] = c.params;
    assert.ok(limit >= 1 && limit <= 200, `limit ${limit} is outside 1..200`);
    assert.ok(offset >= 0, `offset ${offset} is negative`);
  }
  assert.strictEqual(calls[0].params[0], 200, 'an absurd limit is clamped to the 200 ceiling');
  assert.strictEqual(calls[0].params[1], 0, 'a negative offset is clamped to 0');
});

test('list endpoints report whether another page exists', async () => {
  // The stub returns exactly min(limit, 3) rows, so limit=3 fills the page
  // (hasMore) and limit=5 does not.
  const full = await get(PORT_WITH_KEY, '/api/admin/questions?limit=3', ADMIN_KEY);
  assert.strictEqual(full.json.rows.length, 3);
  assert.strictEqual(full.json.hasMore, true);

  const partial = await get(PORT_WITH_KEY, '/api/admin/questions?limit=5', ADMIN_KEY);
  assert.strictEqual(partial.json.hasMore, false);
});

test('stats returns the shape the dashboard renders', async () => {
  const { json } = await get(PORT_WITH_KEY, '/api/admin/stats', ADMIN_KEY);
  for (const field of ['users', 'chats', 'messages', 'questions', 'flagged',
                       'unresolved', 'feedbackCount', 'averageRating',
                       'questionsPerDay', 'questionsByMode', 'retentionDays']) {
    assert.ok(field in json, `stats is missing "${field}"`);
  }
  assert.ok(Array.isArray(json.questionsPerDay));
  assert.strictEqual(typeof json.averageRating, 'number', 'averageRating must be a number, not a string');
  assert.strictEqual(json.questionsByMode.rule, 3);
  assert.strictEqual(typeof json.retentionDays.analytics, 'number');
});

// The admin routes must be registered BEFORE the /api catch-all, or they would
// return "Not found" in production while looking fine in development.
test('an unknown admin path is a JSON 404, and still requires no special casing', async () => {
  const res = await get(PORT_WITH_KEY, '/api/admin/nope', ADMIN_KEY);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.contentType, 'application/json');
});

// The dashboard is read-only by design: a leaked key must not be able to change
// or delete anything.
test('the admin API exposes no write verbs', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = await fetch(`http://localhost:${PORT_WITH_KEY}/api/admin/questions`, {
      method, headers: { 'x-admin-key': ADMIN_KEY },
    });
    assert.strictEqual(res.status, 404, `${method} /api/admin/questions should not be routed`);
  }
});
