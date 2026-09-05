'use strict';

require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

// Security regression tests — lock in the controls verified during the security
// engagement so a future change can't silently reintroduce a vulnerability:
//   - authorization isolation (no cross-user IDOR on chats/messages/schedule)
//   - per-user message rate limit (AI cost protection, SEC-006)
//   - message length cap (SEC-007) and chat-title cap (SEC-011)
//   - schedule input sanitization (server-authoritative)
//
// Runs the real server as a subprocess against a THROWAWAY Postgres schema on
// the same Supabase project (DB_SCHEMA) — the schema-per-run equivalent of the
// old throwaway-sqlite-file trick, since Postgres has no per-test files. The
// schema is dropped in `after`, so this never touches development/production
// data (which live in the default "public" schema).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

const PORT = 3998;
const BASE = `http://localhost:${PORT}/api`;
const TEST_SCHEMA = `sec_test_${Date.now()}`;
let server;

function waitForBoot(proc, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('server boot timeout')), timeoutMs);
    proc.stdout.on('data', (d) => { if (d.toString().includes('running at')) { clearTimeout(to); resolve(); } });
    proc.stderr.on('data', () => {});
    proc.on('exit', (c) => { clearTimeout(to); reject(new Error('server exited early, code ' + c)); });
  });
}

async function api(method, pathname, { token, body } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function makeUser(email) {
  await api('POST', '/auth/signup', { body: { email, password: 'test1234', name: 'T' } });
  const { json } = await api('POST', '/auth/login', { body: { email, password: 'test1234' } });
  return json.token;
}

// This suite needs a real Postgres to run against (it boots the actual server
// into a throwaway schema). Without DATABASE_URL it cannot run at all — but
// FAILING in that case is wrong: it turns "this environment has no database"
// into nine red tests, which is exactly what happens in CI, where no
// DATABASE_URL is configured and the backend job was therefore permanently
// red. Skip cleanly instead, and say loudly why, so a genuine regression in
// these controls is still distinguishable from "not run here".
const DB_AVAILABLE = !!process.env.DATABASE_URL;
const skipReason = DB_AVAILABLE
  ? false
  : 'DATABASE_URL is not set — security suite needs a Postgres to run against';
if (!DB_AVAILABLE) {
  console.log('\n\u26a0\ufe0f  SKIPPING the security regression suite: ' + skipReason);
  console.log('   Set DATABASE_URL (see backend/.env.example) to run it.\n');
}

// node:test runs before/after hooks even when every test is skipped, so both
// have to no-op themselves rather than relying on the skips.
before(async () => {
  if (!DB_AVAILABLE) return;
  server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DB_SCHEMA: TEST_SCHEMA, NODE_ENV: 'test', JWT_SECRET: 'ci-test-secret', ANTHROPIC_API_KEY: '' },
  });
  await waitForBoot(server);
});

after(async () => {
  if (!DB_AVAILABLE) return;
  if (server) server.kill('SIGKILL');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  } catch (e) {
    console.error('Failed to drop test schema:', e.message);
  } finally {
    await pool.end();
  }
});

test('authorization: a user cannot read/modify/delete another user’s chat (IDOR)', { skip: skipReason }, async () => {
  const ts = Date.now();
  const alice = await makeUser(`alice_${ts}@x.com`);
  const bob = await makeUser(`bob_${ts}@x.com`);
  const { json: chat } = await api('POST', '/chats', { token: alice, body: { title: 'secret' } });
  const cid = chat.id;
  await api('POST', `/chats/${cid}/messages`, { token: alice, body: { content: 'where is Mr. Hunter', mode: 'rule' } });

  assert.equal((await api('GET', `/chats/${cid}/messages`, { token: bob })).status, 404, 'GET messages');
  assert.equal((await api('PATCH', `/chats/${cid}`, { token: bob, body: { title: 'hacked' } })).status, 404, 'PATCH');
  assert.equal((await api('DELETE', `/chats/${cid}`, { token: bob })).status, 404, 'DELETE');
  assert.equal((await api('POST', `/chats/${cid}/messages`, { token: bob, body: { content: 'x', mode: 'rule' } })).status, 404, 'POST msg');

  const bobChats = await api('GET', '/chats', { token: bob });
  assert.equal(bobChats.json.length, 0, 'Bob sees none of Alice’s chats');
});

test('authorization: schedules are per-account', { skip: skipReason }, async () => {
  const ts = Date.now();
  const alice = await makeUser(`sa_${ts}@x.com`);
  const bob = await makeUser(`sb_${ts}@x.com`);
  await api('PUT', '/schedule', { token: alice, body: { schedule: { 1: '253' } } });
  const bobSched = await api('GET', '/schedule', { token: bob });
  assert.deepEqual(bobSched.json.schedule, {}, 'Bob’s schedule is empty, not Alice’s');
});

test('schedule input is sanitized server-side (period range, room digits, teacher text)', { skip: skipReason }, async () => {
  const alice = await makeUser(`san_${Date.now()}@x.com`);
  // Legacy bare-string rooms still accepted; period 9 dropped; non-digit room dropped.
  const r1 = await api('PUT', '/schedule', {
    token: alice,
    body: { schedule: { 1: '253', 2: 'Room 251!!', 9: '999', 4: 'abc' } },
  });
  assert.deepEqual(r1.json.schedule, {
    1: { room: '253', teacher: '' },
    2: { room: '251', teacher: '' },
  }, 'period 9 dropped, non-digits stripped, normalized to {room,teacher}');

  // Object form with teacher: room reduced to digits, angle brackets stripped from teacher.
  const r2 = await api('PUT', '/schedule', {
    token: alice,
    body: { schedule: { 1: { room: '2-5-3', teacher: 'Mrs. Thornton' }, 3: { room: '', teacher: 'a<b>c' } } },
  });
  assert.deepEqual(r2.json.schedule, {
    1: { room: '253', teacher: 'Mrs. Thornton' },
    3: { room: '', teacher: 'abc' },
  }, 'room digits only; teacher kept but <> stripped');
});

test('message length is capped (SEC-007)', { skip: skipReason }, async () => {
  const alice = await makeUser(`len_${Date.now()}@x.com`);
  const { json: chat } = await api('POST', '/chats', { token: alice, body: { title: 't' } });
  const r = await api('POST', `/chats/${chat.id}/messages`, { token: alice, body: { content: 'x'.repeat(4100), mode: 'rule' } });
  assert.equal(r.status, 400, 'over-length message rejected');
});

test('per-user message rate limit trips (SEC-006)', { skip: skipReason }, async () => {
  const alice = await makeUser(`rl_${Date.now()}@x.com`);
  const { json: chat } = await api('POST', '/chats', { token: alice, body: { title: 't' } });
  let got429 = false;
  for (let i = 0; i < 25; i++) {
    const r = await api('POST', `/chats/${chat.id}/messages`, { token: alice, body: { content: 'hi', mode: 'rule' } });
    if (r.status === 429) { got429 = true; break; }
  }
  assert.ok(got429, 'a 429 should appear within 25 rapid messages');
});

test('chat title is bounded to 80 chars (SEC-011)', { skip: skipReason }, async () => {
  const alice = await makeUser(`ti_${Date.now()}@x.com`);
  const { json: chat } = await api('POST', '/chats', { token: alice, body: { title: 't' } });
  await api('PATCH', `/chats/${chat.id}`, { token: alice, body: { title: 'y'.repeat(200) } });
  const { json } = await api('GET', '/chats', { token: alice });
  assert.equal(json[0].title.length, 80, 'title truncated to 80');
});

test('password policy: short and common passwords are rejected (M3)', { skip: skipReason }, async () => {
  const ts = Date.now();
  const short = await api('POST', '/auth/signup', { body: { email: `short_${ts}@x.com`, password: 'test12' } });
  assert.equal(short.status, 400, 'sub-8-char password rejected');
  const common = await api('POST', '/auth/signup', { body: { email: `common_${ts}@x.com`, password: 'password123' } });
  assert.equal(common.status, 400, 'common password rejected');
  const ok = await api('POST', '/auth/signup', { body: { email: `okpw_${ts}@x.com`, password: 'test1234' } });
  assert.equal(ok.status, 200, 'compliant password accepted');
});

test('session revocation: changing password invalidates old tokens (H1)', { skip: skipReason }, async () => {
  const email = `rev_${Date.now()}@x.com`;
  const token = await makeUser(email);
  assert.equal((await api('GET', '/auth/me', { token })).status, 200, 'old token initially valid');
  const chg = await api('POST', '/auth/change-password', {
    token, body: { currentPassword: 'test1234', newPassword: 'test5678' },
  });
  assert.equal(chg.status, 200, 'password changed');
  assert.equal((await api('GET', '/auth/me', { token })).status, 401, 'old token revoked after change');
  assert.equal((await api('GET', '/auth/me', { token: chg.json.token })).status, 200, 'refreshed token valid');
});

test('unauthenticated requests are rejected', { skip: skipReason }, async () => {
  assert.equal((await api('GET', '/chats')).status, 401);
  assert.equal((await api('GET', '/schedule')).status, 401);
  assert.equal((await api('GET', '/teachers')).status, 401);
});
