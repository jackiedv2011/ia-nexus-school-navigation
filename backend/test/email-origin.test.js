'use strict';

// Regression tests for host-header injection in the links this app EMAILS.
//
// The bug: getFrontendOrigin built the "verify your email" link from
// `req.get('host')`, which is set by the caller. An unauthenticated POST to
// /api/auth/signup carrying "Host: evil.example" made the real service send a
// real email — from the school's own address, to any address the attacker
// typed — containing a link to evil.example with a live token on it.
//
// Each case runs the REAL server in a child process with `db` and `email`
// stubbed, and speaks raw HTTP so the Host header can actually be set (fetch()
// forbids overriding it, which is why this is not a one-line test).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const BACKEND = path.join(__dirname, '..');

const HARNESS = `
const dbPath = require.resolve(${JSON.stringify(path.join(BACKEND, 'db.js'))});
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  get: async (sql) => /rate_limits/.test(sql)
    ? { count: 1, reset_at: new Date(Date.now() + 60000).toISOString() } : undefined,
  all: async () => [],
  run: async () => ({ changes: 1, rows: [{ id: 1 }], lastInsertRowid: 1 }),
  init: async () => {}, close: async () => {}, query: async () => ({ rows: [] }),
  pool: {}, SCHEMA: 'public',
}};
const emailPath = require.resolve(${JSON.stringify(path.join(BACKEND, 'email.js'))});
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: {
  sendResetCode: async () => ({}),
  sendVerificationEmail: async (to, url) => { process.send({ sent: { to, url } }); },
  isEmailConfigured: () => true,
}};
require(${JSON.stringify(path.join(BACKEND, 'server.js'))});
`;

const harnessFile = path.join(os.tmpdir(), `ia-origin-harness-${process.pid}.js`);
fs.writeFileSync(harnessFile, HARNESS);
process.on('exit', () => { try { fs.unlinkSync(harnessFile); } catch { /* gone */ } });

let nextPort = 3960;

// Boots a server with the given env, signs up with the given Host header, and
// resolves with the verification URL that was emailed (or null if none was).
function signupWithHost(host, env) {
  const port = nextPort++;
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [harnessFile], {
      env: {
        // Deliberately start from a clean slate rather than process.env, so a
        // FRONTEND_URL in the developer's own .env cannot mask a failure here.
        PATH: process.env.PATH,
        PORT: String(port), JWT_SECRET: 'origin-test', NODE_ENV: 'production',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    let emailed = null;
    proc.on('message', (m) => { if (m.sent) emailed = m.sent; });

    const done = (fn) => { proc.kill('SIGKILL'); clearTimeout(timer); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error('boot timeout'))), 12000);

    proc.stdout.on('data', (d) => {
      if (!d.toString().includes('running at')) return;
      const body = JSON.stringify({ email: `v${port}@school.edu`, password: 'correct-horse-battery' });
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write(`POST /api/auth/signup HTTP/1.1\r\nHost: ${host}\r\n`
                 + `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n`
                 + `Connection: close\r\n\r\n${body}`);
      });
      sock.on('data', () => {});
      sock.on('error', () => {});
      // The email send is fire-and-forget, so let it land before reading.
      sock.on('close', () => setTimeout(() => done(() => resolve(emailed)), 250));
    });
    proc.stderr.on('data', () => {});
    proc.on('error', (e) => done(() => reject(e)));
  });
}

test('a spoofed Host header never reaches an emailed link', async () => {
  const emailed = await signupWithHost('evil.example', {});
  assert.strictEqual(emailed, null,
    `an unconfigured deployment must send NO link rather than one built from the Host header; got ${emailed && emailed.url}`);
});

test('a spoofed Host header cannot override FRONTEND_URL', async () => {
  const emailed = await signupWithHost('evil.example', { FRONTEND_URL: 'https://nexus.example.org' });
  assert.ok(emailed, 'a configured deployment should send the email');
  assert.ok(emailed.url.startsWith('https://nexus.example.org/verify-email?token='),
    `link should use FRONTEND_URL, got ${emailed.url}`);
  assert.ok(!emailed.url.includes('evil.example'));
});

test('a spoofed Host header cannot override RENDER_EXTERNAL_URL', async () => {
  // The real production path: Render injects this, so a normal deploy is safe
  // with no configuration of its own.
  const emailed = await signupWithHost('evil.example', {
    RENDER_EXTERNAL_URL: 'https://ia-nexus.onrender.com',
  });
  assert.ok(emailed);
  assert.ok(emailed.url.startsWith('https://ia-nexus.onrender.com/verify-email?token='), emailed.url);
});

test('a Host on the allowlist is accepted', async () => {
  const emailed = await signupWithHost('ok.example', { ALLOWED_HOSTS: 'ok.example,other.example' });
  assert.ok(emailed, 'an allowlisted host should produce a link');
  assert.ok(emailed.url.startsWith('http://ok.example/verify-email?token='), emailed.url);
});

test('a Host NOT on the allowlist is refused', async () => {
  const emailed = await signupWithHost('evil.example', { ALLOWED_HOSTS: 'ok.example' });
  assert.strictEqual(emailed, null, 'a host outside the allowlist must not produce a link');
});

test('a Host carrying more than a hostname is refused even if it prefixes an allowed one', async () => {
  for (const host of ['ok.example/evil', 'ok.example evil.example', 'ok.example@evil.example']) {
    const emailed = await signupWithHost(host, { ALLOWED_HOSTS: 'ok.example' });
    assert.strictEqual(emailed, null, `host ${JSON.stringify(host)} must be refused`);
  }
});

test('a trailing slash on FRONTEND_URL does not produce a double slash', async () => {
  const emailed = await signupWithHost('anything', { FRONTEND_URL: 'https://nexus.example.org/' });
  assert.ok(emailed);
  assert.ok(emailed.url.startsWith('https://nexus.example.org/verify-email?'),
    `expected no "//" before the path, got ${emailed.url}`);
});
