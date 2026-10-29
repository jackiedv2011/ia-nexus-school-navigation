require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const db = require('./db');
const { sendResetCode, sendVerificationEmail, isEmailConfigured } = require('./email');
const { cacheControlFor } = require('./staticCache');

// LLM provider: Anthropic (Claude)
const { processMessage: processMessageLLM } = require('./chatbot-llm');
if (process.env.ANTHROPIC_API_KEY) {
  console.log('✅ Using Anthropic (Claude Haiku) as LLM provider');
} else {
  console.warn('⚠️  ANTHROPIC_API_KEY not set. Interactive mode will not work.');
}
const { processMessage: processMessageRules } = require('./chatbot-rules');
const { findBadWords } = require('./badWords');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── JWT secret (C3) ───────────────────────────────────────────────────────────
// In production a real secret is mandatory — refuse to boot with an insecure
// fallback so tokens can never be forged. In development we allow a clearly
// labelled throwaway secret for convenience.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET must be set in production. Refusing to start.');
    process.exit(1);
  }
  console.warn('⚠️  JWT_SECRET not set — using an insecure development-only default.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';

// ─── Admin dashboard access ─────────────────────────────────────────────────
// Deliberately NOT tied to the regular user/role system — this app has no
// concept of an "admin" account, and retrofitting one is a bigger change than
// "let me see the dashboard" calls for. Instead the dashboard is gated by a
// single shared secret set via env var, sent as the x-admin-key header. In
// production this MUST be set to a real random value (never committed) or the
// dashboard refuses every request.
const ADMIN_KEY = process.env.ADMIN_KEY || '';
if (!ADMIN_KEY && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  ADMIN_KEY not set — the admin dashboard is disabled in production.');
}

// Render (and most hosts) sit behind a reverse proxy. Trust the first proxy hop
// so req.ip reflects the real client address used by the rate limiter (H2).
app.set('trust proxy', 1);
if (isEmailConfigured()) {
  console.log('✅ Email provider configured — password reset codes will be emailed');
} else {
  console.warn('⚠️  Email not configured — password reset codes will print to this console (dev mode)');
}

const RESET_CODE_TTL_MIN = 10;
const MAX_CODE_ATTEMPTS  = 5;
const MIN_PASSWORD_LEN   = 8;   // audit M3 — NIST 800-63B floor
// Session tokens are long-lived so a signed-in user is never forced to log back
// in on the same device. token_version (audit H1) is the actual revocation
// mechanism, not expiry — see the SESSION_TTL use sites for the full rationale.
const SESSION_TTL = '365d';

// A valid (cost-10) bcrypt hash compared against when a login email doesn't exist,
// so bcrypt runs in both branches and login timing can't be used to enumerate
// accounts (audit M1). It is not the hash of any real/derivable credential.
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// A small set of the most common / trivially-guessable passwords. Rejecting these
// (case-insensitively) blunts credential-stuffing against a school population
// without a heavyweight dependency (audit M3).
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', '11111111', '00000000', 'iloveyou', 'letmein1',
  'welcome1', 'admin123', 'changeme', 'football', 'baseball', 'sunshine',
  'princess', 'passw0rd', 'trustno1', 'whatever', 'starwars',
]);

// Central password policy used by signup, change-password, and reset-password so
// the rule can never drift between endpoints. Returns an error string, or null.
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LEN) {
    return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return 'That password is too common. Please choose a less predictable one.';
  }
  return null;
}

// Optional signup allowlist (audit H2/M2). When ALLOWED_EMAIL_DOMAINS is set to a
// comma-separated list (e.g. "students.example.org,example.org"), only those
// domains may register. Empty/unset = open registration (unchanged behavior).
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
function emailDomainAllowed(email) {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  const domain = String(email).split('@')[1]?.toLowerCase() || '';
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

// ─── Security headers + CSP (M1) ───────────────────────────────────────────────
// CSP applies to the SPA that Express serves in production. Everything the page
// loads is now same-origin — the webfonts are self-hosted (see
// frontend/public/fonts/), so 'self' is the whole story for scripts, styles,
// fonts and connections. inline styles stay allowed because React writes style
// attributes. The API calls Anthropic server-side, so the browser never needs
// an external connect-src.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      fontSrc:    ["'self'"],
      // No external image host: the homepage no longer hotlinks a preview photo
      // from images.unsplash.com, and nothing else loads an off-origin image,
      // so allowing one would only widen the policy for no reason.
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  // Allow the SPA's own assets to load without COEP friction.
  crossOriginEmbedderPolicy: false,
  // Explicit (helmet defaults to this already, but spelled out so it can't
  // silently change under a future helmet upgrade): once a browser has seen
  // this over HTTPS, force HTTPS for a year, including subdomains.
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

if (process.env.NODE_ENV !== 'production') {
  // 5183 is this project's dedicated dev port (see frontend/vite.config.js —
  // deliberately not 5173, to avoid colliding with other unrelated local
  // projects). 5173/5174 are kept too in case Vite's own port-bump ever
  // applies before this config is picked up.
  app.use(cors({ origin: ['http://localhost:5183', 'http://localhost:5173', 'http://localhost:5174'], credentials: true }));
}

// Gzips every response over the wire. Cheap CPU cost, real bandwidth win —
// worth it specifically because Supabase's free tier caps monthly bandwidth,
// and the SPA's JS/CSS bundle plus JSON responses compress well.
// ─── Load shedding ────────────────────────────────────────────────────────────
// A hard ceiling on requests in flight at once. Node has no natural back
// pressure: it will happily accept a hundred thousand sockets, run out of
// memory, and take everything down with it. Past this ceiling we return a
// fast, cheap 503 with Retry-After instead — the students already being served
// keep their fast response, and the ones turned away get a real answer to
// retry on rather than a hung connection.
//
// The number is well above a real bell (measured: 1,500 simultaneous requests
// complete in ~1.2 s, so the queue drains far faster than it fills). It exists
// for the case that is not a bell.
const MAX_INFLIGHT = parseInt(process.env.MAX_INFLIGHT, 10) || 2000;
let inflight = 0;
let shedCount = 0;

app.use((req, res, next) => {
  // The health check is exempt: an overloaded server must still be able to say
  // it is overloaded, or the platform will conclude the process is dead.
  if (req.path === '/api/health') return next();

  if (inflight >= MAX_INFLIGHT) {
    shedCount++;
    res.set('Retry-After', '2');
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'The server is very busy right now. Please try again in a moment.' });
  }
  inflight++;
  res.on('close', () => { inflight--; });
  next();
});

app.use(compression());

app.use(express.json({ limit: '64kb' }));

// ─── Static assets ────────────────────────────────────────────────────────────
// The cache policy lives in ./staticCache.js — see the comment there for why it
// is the single biggest lever on what the bell feels like.

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist'), {
    index: false,               // the SPA catch-all below owns "/"
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control', cacheControlFor(filePath));
    },
  }));
}

// ─── Health check ─────────────────────────────────────────────────────────────
// Unauthenticated by design — this is what Render and any uptime monitor hit to
// learn whether the process AND its database are alive.
//
// The database probe is CACHED for a few seconds. Without that, this endpoint
// was a free way for anyone to make the server run a query: hammering it opens
// a connection per request and can exhaust the pool, taking down the endpoints
// that actually matter. A monitor polls every 10-60s, so a 5s cache costs it
// nothing and removes the amplification entirely.
const HEALTH_CACHE_MS = 5_000;
let healthCache = { at: 0, ok: false, checked: false };
let healthInFlight = null;

async function probeDatabase() {
  // Collapse concurrent probes into one query rather than one per caller.
  if (healthInFlight) return healthInFlight;
  healthInFlight = (async () => {
    try {
      await db.get('SELECT 1');
      healthCache = { at: Date.now(), ok: true, checked: true };
    } catch {
      healthCache = { at: Date.now(), ok: false, checked: true };
    } finally {
      healthInFlight = null;
    }
    return healthCache;
  })();
  return healthInFlight;
}

app.get('/api/health', async (req, res) => {
  if (!healthCache.checked || Date.now() - healthCache.at > HEALTH_CACHE_MS) {
    await probeDatabase();
  }
  const age = Math.round((Date.now() - healthCache.at) / 1000);
  res.set('Cache-Control', 'no-store');
  if (healthCache.ok) return res.json({ ok: true, checkedSecondsAgo: age });
  res.status(503).json({ ok: false, error: 'Database unreachable', checkedSecondsAgo: age });
});

// ─── Rate limiting (H1) ────────────────────────────────────────────────────────
// Counters live in Postgres (the `rate_limits` table), not in an in-memory Map —
// a Map only works because there's exactly one server process; the moment this
// ran as more than one instance behind a load balancer, each instance would
// count independently and every limit (including the AI-cost budget) would
// silently multiply. One shared, atomic, DB-backed counter fixes that.
//
// Schools sit behind a single NAT/public IP, so EVERY student shares one address.
// A tight per-IP cap would lock the whole school out. We therefore use a generous
// per-IP ceiling (gross-abuse protection) PLUS a strict per-email lockout on
// login that protects an individual account from brute force regardless of IP.
// ipMax is configurable via RATE_IP_MAX because the deployment reality here is
// specific and confirmed: the whole school (~1,500 students) sits behind one
// public IP, so this ceiling is a budget for the ENTIRE student body's combined
// traffic on guest-accessible endpoints (guest chat, route finder, signup/login
// attempts, feedback) — not a per-student limit. 100/min was sized for a
// generic "household behind a NAT" case; load-tested locally against the real
// backend, that number visibly saturates in seconds under just 100 concurrent
// requests from one IP (60 of the last 100 got 429'd). The new default (4000/min
// = ~67/sec) is sized to comfortably absorb an entire school's realistic,
// non-synchronized peak burst (e.g. a bell just rang) while still meaningfully
// throttling an actual scripted flood. Tune from real observed beta traffic.
const RATE = {
  ipMax: parseInt(process.env.RATE_IP_MAX, 10) || 4000, ipWindowMs: 60_000,
  emailMax: 5, emailWindowMs: 15 * 60_000,  // per-account failed-login lockout — keyed by email, unaffected by shared IP
};

// Per-user message limits (SEC-006): bound how OFTEN any one account can trigger a
// chat response — primarily to cap AI-provider cost in interactive mode. This is a
// frequency guard only; it does not alter how responses are generated. Keyed by
// user id, not IP, so the shared-school-IP situation doesn't affect this one.
const MSG_RATE = { perMin: 20, perHour: 150 };

// GLOBAL ceiling on paid interactive LLM calls across ALL users (audit H2). The
// per-user limit alone can't stop cost abuse via many free accounts, so this caps
// total spend regardless of how many accounts are involved. Rule-mode chat is not
// affected (it makes no external call).
//
// Configurable via env vars because raising this is a real billing decision
// against your Anthropic key, not a code change — the defaults below are left
// UNCHANGED from before this audit. At the defaults, only 60 interactive-AI
// requests succeed per minute across the whole school; the rest get a 429
// ("assistant is busy") rather than failing open. If your beta needs more
// concurrent AI usage, decide your acceptable spend and raise AI_GLOBAL_PER_MIN
// / AI_GLOBAL_PER_HOUR in the environment — no code change needed either way.
const GLOBAL_AI = {
  perMin: parseInt(process.env.AI_GLOBAL_PER_MIN, 10) || 60,
  perHour: parseInt(process.env.AI_GLOBAL_PER_HOUR, 10) || 1000,
};

// Generous per-user ceiling applied to authenticated data routes (audit L4) so a
// single token can't hammer read/compute endpoints without bound. Keyed by user id
// (a school shares one NAT IP, so per-user is the right granularity).
const USER_ROUTE_RATE = { perMin: 240 };
const MAX_MSG_LEN = 4000;      // cap chat message length (SEC-007) — generous for real use
const AI_TIMEOUT_MS = 25_000;  // graceful ceiling on the AI provider call (SEC-013)

// Password-reset email-bombing throttle (SEC-012): bound how often a reset email
// can be sent for any single address, independent of IP (a school shares one NAT).
// Keyed by a one-way hash of the email — never the raw address (privacy).
const RESET_EMAIL = { perHour: 4, minGapMs: 60_000 };
const emailKey = (email) => crypto.createHash('sha256').update(email).digest('hex');

// Atomic, DB-backed fixed-window counter. Every call both records the hit AND
// reports whether the caller is still within `max` for this `key` — a single
// round-trip, race-safe under concurrent requests via Postgres's own row
// locking (no separate read-then-write race window).
// ─── The counter itself ───────────────────────────────────────────────────────
// Counting happens IN MEMORY and is flushed to Postgres in the background.
//
// Why not straight to the database on every request, as before? Because of the
// bell. Every student is behind the school's single NAT address, so every
// request in the building increments the SAME row — `ip:<school>`. Postgres
// serialises writers on a row, so the busiest second of the day was also the
// one where every request queued behind every other one, and each request paid
// a full network round trip to do it.
//
// It also meant a database hiccup took down things that do not need a database
// at all: the route finder and guest chat return 503 if the limiter cannot
// reach Postgres. In memory, they keep working.
//
// The trade-off, stated plainly: with more than one server instance each
// instance counts its own share, so the effective ceiling is roughly
// `limit x instances` until the next flush. That is acceptable here — these
// limits are gross-abuse ceilings sized for a whole school, not per-student
// quotas — and the flush keeps instances converging. The two limits where
// exactness genuinely matters (the per-account login lockout, and the global
// AI spend budget) do NOT use this path: they read and write Postgres
// directly, so they hold across instances and restarts.
const FLUSH_INTERVAL_MS = 10_000;

// key -> { count, resetAt (ms), pending (increments not yet flushed) }
const counters = new Map();
const MAX_COUNTER_KEYS = 50_000;   // bounded so a key-space flood cannot grow it forever

function bumpLocal(key, windowMs, max) {
  const now = Date.now();
  let c = counters.get(key);
  if (!c || c.resetAt <= now) {
    c = { count: 0, resetAt: now + windowMs, pending: 0 };
    // Evict the oldest entry rather than growing without bound. Every key here
    // self-expires anyway; this only matters under a deliberate flood of
    // distinct keys (many source IPs), which is exactly when it must not OOM.
    if (counters.size >= MAX_COUNTER_KEYS) {
      counters.delete(counters.keys().next().value);
    }
    counters.set(key, c);
  }
  c.count++;
  c.pending++;
  return { ok: c.count <= max, retryAfter: Math.max(1, Math.ceil((c.resetAt - now) / 1000)) };
}

// Synchronous, no I/O, cannot fail. Callers that used to `await` this still
// can — an async function's return value is a promise either way.
async function checkRateLimit(key, windowMs, max) {
  return bumpLocal(key, windowMs, max);
}

// Push local counts into Postgres so a restart does not forget them entirely
// and so sibling instances see each other. Best effort: a failure here must
// never affect request handling, which is the whole point of counting locally.
async function flushCounters() {
  const now = Date.now();
  for (const [key, c] of counters) {
    if (c.resetAt <= now) { counters.delete(key); continue; }
    if (c.pending === 0) continue;
    const delta = c.pending;
    c.pending = 0;
    try {
      await db.run(`
        INSERT INTO rate_limits (key, count, reset_at) VALUES (?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limits.reset_at < NOW() THEN ? ELSE rate_limits.count + ? END,
          reset_at = CASE WHEN rate_limits.reset_at < NOW() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
      `, key, delta, new Date(c.resetAt).toISOString(), delta, delta);
    } catch (e) {
      c.pending += delta;   // put it back; the next flush retries
      console.error('Rate-limit flush failed:', e.message);
      return;               // the database is unhappy — stop hammering it
    }
  }
}
setInterval(() => { flushCounters().catch(() => {}); }, FLUSH_INTERVAL_MS).unref();

// The exact, database-backed counter, for the handful of limits where being
// approximately right is not good enough. One atomic round trip per call, safe
// across instances and across restarts. Used only by low-volume limits, so the
// cost that made it wrong for the per-IP path does not apply here.
async function checkRateLimitDurable(key, windowMs, max) {
  const resetAt = new Date(Date.now() + windowMs).toISOString();
  const row = await db.get(`
    INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at < NOW() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < NOW() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
    RETURNING count, reset_at
  `, key, resetAt);
  const ok = row.count <= max;
  const retryAfter = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  return { ok, retryAfter };
}

// Records an attack/abuse signal — failed logins, rate-limit trips, honeypot
// triggers, rejected admin-key attempts. Never throws (a logging failure must
// not affect the request it's logging), and deliberately fire-and-forget at
// every call site so logging never adds latency to the actual response.
function logSecurityEvent({ type, req, email, detail }) {
  const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';
  db.run(
    'INSERT INTO security_events (event_type, ip, email, path, detail) VALUES (?, ?, ?, ?, ?)',
    type, ip, email ?? null, req?.path ?? null, detail ?? null,
  ).catch((e) => console.error('Security event log write failed:', e.message));
}

// Periodic cleanup so `rate_limits` (and other self-expiring tables) don't grow
// unbounded. Never throws — a cleanup failure must not affect request handling.
setInterval(async () => {
  try { await db.run('DELETE FROM rate_limits WHERE reset_at < NOW()'); } catch { /* ignore */ }
  try { await db.run('DELETE FROM login_throttle WHERE reset_at < ?', new Date().toISOString()); } catch { /* ignore */ }
}, 5 * 60_000).unref();

// Returns true if a reset email may be sent now for this address (and records
// it). Two independent DB-backed checks: a short cooldown between sends, and an
// hourly cap — both enforced the same atomic way as every other rate limit.
async function resetEmailAllowed(normalizedEmail) {
  const key = emailKey(normalizedEmail);
  // Durable: a redeploy must not hand an attacker a fresh budget for bombing
  // somebody's inbox, and the volume here is a few sends an hour.
  const cooldown = await checkRateLimitDurable(`resetcooldown:${key}`, RESET_EMAIL.minGapMs, 1);
  if (!cooldown.ok) return false;
  const hourly = await checkRateLimitDurable(`resethour:${key}`, 60 * 60_000, RESET_EMAIL.perHour);
  return hourly.ok;
}

// Periodically purge expired password-reset codes so the table doesn't grow (L7).
setInterval(async () => {
  try {
    await db.run('DELETE FROM password_reset_codes WHERE expires_at < ?', new Date().toISOString());
  } catch (e) {
    console.error('Reset-code cleanup failed:', e.message);
  }
}, 60 * 60_000).unref();

// Data retention: the analytics/moderation log exists to show usage volume and
// catch flagged content, not to be a permanent transcript of everything anyone
// ever asked. Purging content older than this window bounds how much stands to
// be exposed by any future admin-key leak or database compromise. The audit
// trail for admin-dashboard access itself gets a longer window since that one
// exists specifically to answer "did anyone look, and when" over time.
const ANALYTICS_RETENTION_DAYS = 180;
const ADMIN_AUDIT_RETENTION_DAYS = 365;
const SECURITY_EVENTS_RETENTION_DAYS = 365;
setInterval(async () => {
  try {
    await db.run(`DELETE FROM analytics_log WHERE created_at < NOW() - INTERVAL '${ANALYTICS_RETENTION_DAYS} days'`);
    await db.run(`DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL '${ADMIN_AUDIT_RETENTION_DAYS} days'`);
    await db.run(`DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '${SECURITY_EVENTS_RETENTION_DAYS} days'`);
  } catch (e) {
    console.error('Data-retention cleanup failed:', e.message);
  }
}, 24 * 60 * 60_000).unref();

async function ipRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  try {
    const { ok } = await checkRateLimit(`ip:${ip}`, RATE.ipWindowMs, RATE.ipMax);
    if (!ok) {
      logSecurityEvent({ type: 'rate_limited', req, detail: 'ip' });
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }
    next();
  } catch (e) {
    console.error('Rate limit check failed:', e.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}

// Per-account failed-login lockout, persisted in Postgres so a restart/redeploy
// can't clear an active lockout (audit L3).
async function isEmailLocked(email) {
  const e = await db.get('SELECT count, reset_at FROM login_throttle WHERE email = ?', email);
  if (!e) return false;
  if (Date.now() > new Date(e.reset_at).getTime()) {
    await db.run('DELETE FROM login_throttle WHERE email = ?', email);
    return false;
  }
  return e.count >= RATE.emailMax;
}
async function registerEmailFailure(email) {
  const now = Date.now();
  const e = await db.get('SELECT count, reset_at FROM login_throttle WHERE email = ?', email);
  if (!e || now > new Date(e.reset_at).getTime()) {
    const resetAt = new Date(now + RATE.emailWindowMs).toISOString();
    await db.run(`
      INSERT INTO login_throttle (email, count, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(email) DO UPDATE SET count = 1, reset_at = excluded.reset_at
    `, email, resetAt);
  } else {
    await db.run('UPDATE login_throttle SET count = count + 1 WHERE email = ?', email);
  }
}
async function clearEmailFailures(email) {
  await db.run('DELETE FROM login_throttle WHERE email = ?', email);
}

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Server-side revocation (audit H1): the token is only valid if it matches the
    // account's current token_version. Bumping that version (on password change,
    // reset, or account deletion) invalidates every previously-issued token, and a
    // token for a deleted account no longer resolves to a row.
    const current = await db.get('SELECT token_version FROM users WHERE id = ?', payload.id);
    if (!current || (payload.tv ?? 0) !== current.token_version) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Like `auth`, but never rejects the request — used on routes that welcome
// guests AND signed-in users (e.g. experience feedback). Sets req.user when a
// valid token is present, leaves it undefined otherwise.
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const current = await db.get('SELECT token_version FROM users WHERE id = ?', payload.id);
    if (current && (payload.tv ?? 0) === current.token_version) {
      req.user = payload;
    }
  } catch { /* invalid/expired token on an optional route — just proceed as a guest */ }
  next();
}

// Gates the admin dashboard's API behind a single shared secret (see ADMIN_KEY
// above). Constant-time compare avoids leaking the key length/contents via
// response-timing side channels. Every attempt — success AND failure — is
// logged to admin_audit_log: there's no per-admin identity here (one shared
// secret, not individual accounts), so this can't say WHO looked, but it's
// the difference between being able to prove the dashboard wasn't touched
// while the key was exposed, and having no way to ever know either way.
function adminAuth(req, res, next) {
  const provided = req.headers['x-admin-key'];
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const ok = !!ADMIN_KEY && typeof provided === 'string'
    && provided.length === ADMIN_KEY.length
    && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(ADMIN_KEY));
  db.run('INSERT INTO admin_audit_log (ip, path, success) VALUES (?, ?, ?)', ip, req.path, ok ? 1 : 0)
    .catch((e) => console.error('Admin audit log write failed:', e.message));
  if (!ok) {
    logSecurityEvent({ type: 'admin_key_rejected', req });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Shared paging for the admin list endpoints. Bounded page size, and an offset
// so the dashboard can "Load more" past the first page instead of being blind
// to anything older than the newest N rows.
function pageParams(req) {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  return { limit, offset };
}

// Dedicated per-IP throttle for the admin API. adminAuth alone logs and rejects
// a bad key but never slows the attacker down — a single shared secret with
// unlimited guesses is brute-forceable. Its own counter key (separate from the
// public ip: limiter) and a tighter ceiling: 60/min still clears ~10 full
// dashboard loads a minute for a legit admin, while capping guesses hard.
async function adminRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  try {
    const { ok } = await checkRateLimit(`admin:${ip}`, 60_000, 60);
    if (!ok) {
      logSecurityEvent({ type: 'rate_limited', req, detail: 'admin' });
      return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    }
    next();
  } catch (e) {
    console.error('Admin rate limit check failed:', e.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}

// Reserve one slot against the global interactive-LLM budget (audit H2). Both
// windows are checked (and counted) via the same atomic DB counter used
// everywhere else; unlike the old in-memory version this doesn't roll back the
// minute counter if the hourly cap is what actually rejects the request, which
// is a negligible, deliberate simplification in exchange for a single atomic
// round-trip per window instead of a check-then-commit transaction.
async function reserveGlobalAiSlot() {
  // Durable: this is a spend ceiling against a real Anthropic bill, so it must
  // hold across instances and restarts, not be counted per-process.
  const minute = await checkRateLimitDurable('aiglobal:minute', 60_000, GLOBAL_AI.perMin);
  if (!minute.ok) return { ok: false, retryAfter: minute.retryAfter };
  const hour = await checkRateLimitDurable('aiglobal:hour', 60 * 60_000, GLOBAL_AI.perHour);
  if (!hour.ok) return { ok: false, retryAfter: hour.retryAfter };
  return { ok: true };
}

// Generous per-user frequency guard for authenticated data routes (audit L4).
async function perUserRouteLimit(req, res, next) {
  try {
    const { ok, retryAfter } = await checkRateLimit(`route:${req.user.id}`, 60_000, USER_ROUTE_RATE.perMin);
    if (!ok) {
      logSecurityEvent({ type: 'rate_limited', req, detail: 'route' });
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  } catch (e) {
    console.error('Rate limit check failed:', e.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}

// Race a promise against a timeout so a hung provider call can't pin a request
// open indefinitely (SEC-013). Used only to wrap the AI call site in server.js;
// the chatbot/AI modules themselves are unchanged.
function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Per-user frequency guard for the chat-message endpoint (SEC-006). Runs AFTER
// `auth`, so req.user is set. Returns 429 when a single account sends too many
// messages too quickly; it never changes the chatbot/AI response itself.
async function perUserMessageLimit(req, res, next) {
  try {
    const uid = req.user.id;
    const minute = await checkRateLimit(`msgmin:${uid}`, 60_000, MSG_RATE.perMin);
    if (!minute.ok) {
      logSecurityEvent({ type: 'rate_limited', req, detail: 'msg_minute' });
      res.set('Retry-After', String(minute.retryAfter));
      return res.status(429).json({ error: 'You’re sending messages too quickly. Please wait a moment.' });
    }
    const hour = await checkRateLimit(`msghour:${uid}`, 60 * 60_000, MSG_RATE.perHour);
    if (!hour.ok) {
      logSecurityEvent({ type: 'rate_limited', req, detail: 'msg_hour' });
      res.set('Retry-After', String(hour.retryAfter));
      return res.status(429).json({ error: 'Hourly message limit reached. Please try again later.' });
    }
    next();
  } catch (e) {
    console.error('Rate limit check failed:', e.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}

// Records one user message into the analytics/moderation log (used by both the
// guest and signed-in chat endpoints) and runs the basic profanity check
// against it. Never throws — a logging failure must not break the chat itself.
async function logAnalytics({ userId, userEmail, source, mode, content, response, resolved }) {
  try {
    const matched = findBadWords(content);
    await db.run(`
      INSERT INTO analytics_log (user_id, user_email, source, mode, content, response, resolved, flagged, matched_words)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      userId ?? null,
      userEmail ?? null,
      source,
      mode,
      content.slice(0, MAX_MSG_LEN),
      // Bound the stored answer the same way as the question so one runaway
      // reply can't bloat the log. resolved is a nullable tri-state: 1 = the
      // engine answered, 0 = it fell back / errored, NULL = unknown (e.g. the
      // interactive LLM path, where we can't cheaply tell).
      response != null ? response.slice(0, MAX_MSG_LEN) : null,
      resolved == null ? null : (resolved ? 1 : 0),
      matched.length > 0 ? 1 : 0,
      matched.length > 0 ? JSON.stringify(matched) : null,
    );
  } catch (e) {
    console.error('Analytics log write failed:', e.message);
  }
}

// In production the backend serves the built SPA itself (same origin), so a
// request-derived origin is correct there. In dev, Vite's proxy rewrites the
// Host header to the backend's own (localhost:3001), so an explicit
// FRONTEND_URL (or the dev default below) is needed to build a link back to
// the actual frontend the browser is running.
// Hosts this app will build an outgoing link for, beyond FRONTEND_URL. Only
// consulted when FRONTEND_URL and RENDER_EXTERNAL_URL are both unset.
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
);

// The origin used to build links we EMAIL to people (verify-your-email).
//
// This must never come from the request's Host header unchecked. The Host
// header is set by the caller, not the server: a signup request carrying
// "Host: evil.example" made this app send a genuine email, from the school's
// own address, to any address the attacker typed, containing a link to
// evil.example with a live token on it. That is a phishing vector handed to an
// unauthenticated attacker, and it is the classic host-header injection.
//
// Resolution order, most trustworthy first:
//   1. FRONTEND_URL          — explicitly configured, always wins.
//   2. RENDER_EXTERNAL_URL   — injected by Render (the deployment target), so
//                              the normal production deploy needs no config.
//   3. A request host on the ALLOWED_HOSTS list, if one is configured.
//   4. Nothing. In production we would rather send no link than a poisoned one,
//      so callers treat null as "cannot send".
// In development there is no attacker in the loop and Vite's proxy rewrites the
// Host header anyway, so the dev server's own origin is used.
function getFrontendOrigin(req) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');

  if (process.env.NODE_ENV !== 'production') {
    // 5183, matching frontend/vite.config.js — the previous default of 5173 was
    // the port this project deliberately does NOT use, so every dev
    // verification link pointed at nothing.
    return 'http://localhost:5183';
  }

  const host = String(req?.get?.('host') || '').toLowerCase();
  // Reject anything that isn't a bare host[:port] before comparing, so a header
  // carrying a path, scheme or whitespace can never reach a URL we build.
  if (/^[a-z0-9.\-]+(:\d{1,5})?$/.test(host) && ALLOWED_HOSTS.has(host)) {
    return `${req.protocol}://${host}`;
  }

  console.error(
    'Refusing to build an email link: no FRONTEND_URL / RENDER_EXTERNAL_URL, and '
    + `the request host ${JSON.stringify(host)} is not in ALLOWED_HOSTS. `
    + 'Set FRONTEND_URL to the app’s public URL.',
  );
  return null;
}

// Mints a signed, self-contained email-verification link — no DB table needed
// (unlike password-reset codes) because the token itself carries everything
// needed to verify it, the same pattern already used for the reset-password
// token below. Fire-and-forget at call sites: a failed verification email
// must not fail the signup/resend request itself.
async function sendVerificationLink(req, user) {
  const origin = getFrontendOrigin(req);
  // No trustworthy origin means no link. Sending one built from an unverified
  // Host header would be worse than sending nothing: the user can always
  // request a fresh link once the deployment is configured correctly.
  if (!origin) return;
  const token = jwt.sign({ uid: user.id, purpose: 'verify-email' }, JWT_SECRET, { expiresIn: '24h' });
  const verifyUrl = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await sendVerificationEmail(user.email, verifyUrl);
  } catch (e) {
    console.error('Failed to send verification email:', e.message);
  }
}

function generateChatTitle(message) {
  const roomMatches = message.match(/\b(\d{3,4}[A-Za-z]?)\b/g);
  const teacherMatches = message.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Za-z]+)/gi);
  const teacherNames = teacherMatches
    ? teacherMatches.map(t => t.replace(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s+/i, '').trim())
    : [];
  const whereTeacher = message.match(/where\s+is\s+(?:Mr\.|Ms\.|Mrs\.|Dr\.)?\s*([A-Za-z]+)/i);
  if (whereTeacher && teacherNames.length === 1) return `Location of ${teacherNames[0]}`;
  if (whereTeacher && whereTeacher[1]) return `Location of ${whereTeacher[1]}`;
  if (teacherNames.length >= 2) return `${teacherNames[0]} - ${teacherNames[1]}`;
  if (roomMatches && roomMatches.length >= 2) return `${roomMatches[0]} - ${roomMatches[1]}`;
  if (teacherNames.length === 1 && roomMatches?.length === 1) return `${teacherNames[0]} - ${roomMatches[0]}`;
  if (roomMatches?.length === 1) return `Room ${roomMatches[0]}`;
  if (teacherNames.length === 1) return teacherNames[0];
  return message.slice(0, 40) + (message.length > 40 ? '…' : '');
}

// ─── Auth ────────────────────────────────────────────────────────────────────

// Honeypot field: a form input that's invisible/unreachable for a real user
// (see the frontend's hidden "hp_field") but that naive scripted bots fill in
// because it's just another field in the HTML. No external service, no
// account signup required — a free first line of defense against basic bot
// spam/credential-stuffing scripts, layered on top of (not replacing) the
// existing rate limits. A real CAPTCHA (e.g. Cloudflare Turnstile) would catch
// more sophisticated bots but needs a third-party account to set up.
// True for values that are safe to String() into a lookup key. Objects and
// arrays are not — they stringify into something that looks like a room name
// but can never match one.
function isScalar(v) {
  return typeof v === 'string' || typeof v === 'number';
}

function isBot(req) {
  return typeof req.body.hp_field === 'string' && req.body.hp_field.length > 0;
}

app.post('/api/auth/signup', ipRateLimit, async (req, res) => {
  // A bot filled the honeypot — respond exactly like a real success so it
  // doesn't learn to avoid this field next time, but do nothing.
  if (isBot(req)) {
    logSecurityEvent({ type: 'honeypot_triggered', req, email: req.body?.email });
    return res.json({ message: 'Account created successfully' });
  }
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (!emailDomainAllowed(email)) return res.status(403).json({ error: 'Registration is restricted to approved school email addresses.' });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });
  try {
    const hash = await bcrypt.hash(password, 10);
    // Strip control chars + angle brackets from the display name (audit L2), matching
    // the schedule-teacher sanitizer so a future unsafe render can't become XSS.
    const cleanName = (name == null ? '' : String(name)).replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 60) || null;
    const inserted = await db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?) RETURNING id', email.toLowerCase(), hash, cleanName);
    // Fire-and-forget: signup succeeds even if the verification email fails to
    // send (e.g. SMTP hiccup) — the account still works, unverified, and the
    // user can request the link again via /auth/resend-verification.
    sendVerificationLink(req, { id: inserted.lastInsertRowid, email: email.toLowerCase() }).catch(() => {});
    res.json({ message: 'Account created successfully' });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', ipRateLimit, async (req, res) => {
  if (isBot(req)) {
    logSecurityEvent({ type: 'honeypot_triggered', req, email: req.body?.email });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const normalizedEmail = email.toLowerCase();
  // Per-account lockout protects an individual account from brute force even when
  // many users share one school IP (H1).
  if (await isEmailLocked(normalizedEmail)) {
    logSecurityEvent({ type: 'login_locked_account', req, email: normalizedEmail });
    return res.status(429).json({ error: 'Too many failed attempts for this account. Please try again in a few minutes.' });
  }
  const user = await db.get('SELECT * FROM users WHERE email = ?', normalizedEmail);
  // Constant-time comparison (audit M1): always run bcrypt.compare — against a
  // fixed dummy hash when the account doesn't exist — so response timing doesn't
  // reveal whether an email is registered.
  const valid = await bcrypt.compare(password, user ? user.password : DUMMY_BCRYPT_HASH);
  if (!user || !valid) {
    await registerEmailFailure(normalizedEmail);
    logSecurityEvent({ type: 'login_failed', req, email: normalizedEmail });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  await clearEmailFailures(normalizedEmail);
  // Long-lived on purpose (SESSION_TTL): once a student logs in, they shouldn't
  // have to do it again on the same device. Safe to extend this far because
  // token_version (audit H1) already gives us real revocation — a password
  // change/reset/account deletion instantly invalidates every outstanding token
  // regardless of how long it's nominally valid for.
  const token = jwt.sign({ id: user.id, email: user.email, tv: user.token_version ?? 0 }, JWT_SECRET, { expiresIn: SESSION_TTL });
  res.json({ token, email: user.email, name: user.name || '' });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.get('SELECT id, email, name, email_verified FROM users WHERE id = ?', req.user.id);
  res.json({ id: req.user.id, email: req.user.email, name: user?.name || '', emailVerified: !!user?.email_verified });
});

// Verify-email link target. No `auth` middleware — the signed JWT in the link
// itself IS the credential (same pattern as the password-reset token below),
// so this works even from a fresh browser/device that never logged in.
app.get('/api/auth/verify-email', ipRateLimit, async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Verification token required' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'This verification link has expired or is invalid.' });
  }
  if (payload.purpose !== 'verify-email') return res.status(400).json({ error: 'Invalid verification link' });
  const result = await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', payload.uid);
  if (!result.changes) return res.status(400).json({ error: 'Account no longer exists' });
  res.json({ message: 'Email verified' });
});

// Resend the verification link — rate-limited per account (not just per IP,
// since a school shares one IP) so this can't be used to spam an inbox.
app.post('/api/auth/resend-verification', auth, ipRateLimit, async (req, res) => {
  const { ok, retryAfter } = await checkRateLimitDurable(`resendverify:${req.user.id}`, 5 * 60_000, 1);
  if (!ok) {
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Please wait a few minutes before requesting another verification email.' });
  }
  const user = await db.get('SELECT id, email, email_verified FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.email_verified) return res.json({ message: 'Email already verified' });
  await sendVerificationLink(req, user);
  res.json({ message: 'Verification email sent' });
});

// Update display name
app.post('/api/auth/profile', auth, async (req, res) => {
  // Strip control chars + angle brackets (audit L2) — same rule as signup.
  const cleanName = (req.body.name == null ? '' : String(req.body.name)).replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 60) || null;
  await db.run('UPDATE users SET name = ? WHERE id = ?', cleanName, req.user.id);
  res.json({ name: cleanName || '' });
});

// Change password (while signed in) — verifies the current password first
app.post('/api/auth/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const hash = await bcrypt.hash(newPassword, 10);
  // Bump token_version to revoke every previously-issued session token (audit H1),
  // then mint a fresh token so the CURRENT tab stays signed in while any OTHER
  // outstanding sessions are invalidated.
  const newTv = (user.token_version ?? 0) + 1;
  await db.run('UPDATE users SET password = ?, token_version = ? WHERE id = ?', hash, newTv, req.user.id);
  const token = jwt.sign({ id: user.id, email: user.email, tv: newTv }, JWT_SECRET, { expiresIn: SESSION_TTL });
  res.json({ message: 'Password changed successfully', token });
});

// Delete account — removes the user and all of their chats/messages/codes.
// analytics_log and experience_feedback keep a DENORMALIZED user_email column
// (for moderation records to survive account deletion) that is NOT covered by
// the users.id foreign key (ON DELETE SET NULL only clears user_id). Without
// explicitly scrubbing it here, "Account deleted" would be misleading — the
// person's email would still sit next to every question they ever asked,
// forever. This is a real data-retention/right-to-erasure requirement, not
// just tidiness, for an app that may hold student data.
app.delete('/api/auth/account', auth, async (req, res) => {
  const uid = req.user.id;
  const user = await db.get('SELECT email FROM users WHERE id = ?', uid);
  const chatIds = (await db.all('SELECT id FROM chats WHERE user_id = ?', uid)).map(c => c.id);
  for (const cid of chatIds) await db.run('DELETE FROM messages WHERE chat_id = ?', cid);
  await db.run('DELETE FROM chats WHERE user_id = ?', uid);
  await db.run('DELETE FROM password_reset_codes WHERE user_id = ?', uid);
  if (user?.email) {
    await db.run('UPDATE analytics_log SET user_email = NULL WHERE user_email = ?', user.email);
    await db.run('UPDATE experience_feedback SET user_email = NULL WHERE user_email = ?', user.email);
  }
  await db.run('DELETE FROM users WHERE id = ?', uid);
  res.json({ message: 'Account deleted' });
});

app.post('/api/auth/forgot-password', ipRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const generic = { message: 'If an account exists for this email, a verification code has been sent.' };
  const normalizedEmail = email.toLowerCase();
  const user = await db.get('SELECT * FROM users WHERE email = ?', normalizedEmail);
  if (!user) return res.json(generic);
  // Throttle reset emails per-address to prevent inbox-bombing / send-cost abuse.
  // Still return the generic message so existence is never revealed (SEC-012).
  if (!(await resetEmailAllowed(normalizedEmail))) return res.json(generic);
  await db.run('DELETE FROM password_reset_codes WHERE user_id = ?', user.id);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = bcrypt.hashSync(code, 10);
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60_000).toISOString();
  await db.run('INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)', user.id, codeHash, expiresAt);
  try {
    await sendResetCode(user.email, code, RESET_CODE_TTL_MIN);
  } catch (e) {
    console.error('Failed to send reset email:', e.message);
  }
  res.json(generic);
});

app.post('/api/auth/verify-code', ipRateLimit, async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
  const user = await db.get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
  const record = await db.get('SELECT * FROM password_reset_codes WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1', user.id);
  if (!record) return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
  if (new Date(record.expires_at) < new Date()) {
    await db.run('DELETE FROM password_reset_codes WHERE id = ?', record.id);
    return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await db.run('UPDATE password_reset_codes SET used = 1 WHERE id = ?', record.id);
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
  }
  const match = bcrypt.compareSync(String(code), record.code_hash);
  if (!match) {
    await db.run('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?', record.id);
    const remaining = MAX_CODE_ATTEMPTS - (record.attempts + 1);
    return res.status(400).json({
      error: remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many incorrect attempts. Please request a new code.',
    });
  }
  const resetToken = jwt.sign({ uid: user.id, codeId: record.id, purpose: 'pwreset' }, JWT_SECRET, { expiresIn: `${RESET_CODE_TTL_MIN}m` });
  res.json({ resetToken });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { resetToken, password } = req.body;
  if (!resetToken || !password) return res.status(400).json({ error: 'Reset token and password are required' });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });
  let payload;
  try {
    payload = jwt.verify(resetToken, JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'Reset session expired. Please start over.' });
  }
  if (payload.purpose !== 'pwreset') return res.status(400).json({ error: 'Invalid reset token' });
  const record = await db.get('SELECT * FROM password_reset_codes WHERE id = ? AND user_id = ?', payload.codeId, payload.uid);
  if (!record || record.used) return res.status(400).json({ error: 'This reset request is no longer valid. Please start over.' });
  if (new Date(record.expires_at) < new Date()) {
    await db.run('DELETE FROM password_reset_codes WHERE id = ?', record.id);
    return res.status(400).json({ error: 'Reset request expired. Please start over.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  // Revoke all outstanding session tokens on reset (audit H1) — a reset commonly
  // follows a suspected compromise, so old tokens must stop working.
  await db.run('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', hash, payload.uid);
  await db.run('UPDATE password_reset_codes SET used = 1 WHERE id = ?', record.id);
  res.json({ message: 'Password reset successfully' });
});

// ─── Guest chat (unauthenticated, rule-based only, not saved to chat history) ─
// Powers the chatbot-first landing page: visitors without an account can chat
// immediately. Rule-mode only (no external AI cost/abuse surface) and IP-rate-
// limited like every other unauthenticated route. The conversation itself
// isn't saved anywhere a guest (or anyone else) could read it back — but each
// message IS written to the analytics/moderation log (content + timestamp,
// no identity beyond "guest") so the admin dashboard can show usage volume and
// flag inappropriate messages.
app.post('/api/guest/message', ipRateLimit, async (req, res) => {
  const { content, history } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });
  if (content.trim().length > MAX_MSG_LEN) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MSG_LEN} characters).` });
  }
  const priorMessages = Array.isArray(history)
    ? history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG_LEN) }))
    : [];
  try {
    const result = processMessageRules(content.trim(), priorMessages);
    // Log AFTER generation so we can record the bot's answer and whether the
    // rule engine actually resolved the question (resolved:false marks a fallback).
    logAnalytics({
      userId: null, userEmail: null, source: 'guest', mode: 'rule',
      content: content.trim(), response: result.text, resolved: result.resolved !== false,
    }).catch(() => {});
    res.json({ response: result.text });
  } catch (e) {
    console.error('Guest message processing error:', e);
    // Still log the question on failure — it's an unresolved question worth seeing.
    logAnalytics({
      userId: null, userEmail: null, source: 'guest', mode: 'rule',
      content: content.trim(), response: null, resolved: false,
    }).catch(() => {});
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// ─── Chats ───────────────────────────────────────────────────────────────────

app.get('/api/chats', auth, async (req, res) => {
  const chats = await db.all(`
    SELECT c.id, c.title, c.updated_at,
      (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM chats c WHERE c.user_id = ? ORDER BY c.updated_at DESC
  `, req.user.id);
  res.json(chats);
});

app.post('/api/chats', auth, async (req, res) => {
  const { title } = req.body;
  const result = await db.run('INSERT INTO chats (user_id, title) VALUES (?, ?) RETURNING id', req.user.id, title || 'New Chat');
  const chat = await db.get('SELECT * FROM chats WHERE id = ?', result.lastInsertRowid);
  res.json(chat);
});

app.patch('/api/chats/:id', auth, async (req, res) => {
  const chat = await db.get('SELECT * FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const title = String(req.body.title ?? '').trim().slice(0, 80);   // bound length (SEC-011)
  if (!title) return res.status(400).json({ error: 'Title required' });
  await db.run('UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', title, req.params.id);
  res.json({ ok: true });
});

// Clear ALL conversations for the signed-in user
app.delete('/api/chats', auth, async (req, res) => {
  const uid = req.user.id;
  const chatIds = (await db.all('SELECT id FROM chats WHERE user_id = ?', uid)).map(c => c.id);
  for (const cid of chatIds) await db.run('DELETE FROM messages WHERE chat_id = ?', cid);
  await db.run('DELETE FROM chats WHERE user_id = ?', uid);
  res.json({ ok: true });
});

app.delete('/api/chats/:id', auth, async (req, res) => {
  const chat = await db.get('SELECT * FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  await db.run('DELETE FROM messages WHERE chat_id = ?', req.params.id);
  await db.run('DELETE FROM chats WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

// ─── Messages ─────────────────────────────────────────────────────────────────

app.get('/api/chats/:id/messages', auth, async (req, res) => {
  const chat = await db.get('SELECT * FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  // LEFT JOIN in the caller's own thumbs up/down rating (if any) so the chat UI
  // can restore which button was active after a reload, without a second round-trip.
  const messages = await db.all(`
    SELECT m.*, mf.rating AS my_rating
    FROM messages m
    LEFT JOIN message_feedback mf ON mf.message_id = m.id AND mf.user_id = ?
    WHERE m.chat_id = ?
    ORDER BY m.created_at ASC
  `, req.user.id, req.params.id);
  res.json(messages);
});

app.post('/api/chats/:id/messages', auth, perUserMessageLimit, async (req, res) => {
  const chat = await db.get('SELECT * FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const { content, mode } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });
  if (content.trim().length > MAX_MSG_LEN) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MSG_LEN} characters).` });
  }
  // Global budget guard for the PAID interactive path (audit H2). Reserve a slot
  // before persisting anything so a rejected request leaves no orphan message.
  if (mode === 'interactive') {
    const slot = await reserveGlobalAiSlot();
    if (!slot.ok) {
      res.set('Retry-After', String(slot.retryAfter));
      return res.status(429).json({ error: 'The assistant is busy right now — try Rule Based mode instead, it works instantly.' });
    }
  }
  // Fetch prior turns BEFORE inserting the new user message, so both engines can
  // use them as context for follow-up questions (e.g. "what about 2nd period?").
  // Bounded window (last 20 = ~10 exchanges) keeps rule-engine scans and LLM
  // token cost predictable regardless of how long the chat has grown.
  const priorMessages = (await db.all(
    'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 20', req.params.id
  )).reverse();
  await db.run('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)', req.params.id, 'user', content.trim());
  const analyticsMode = mode === 'interactive' ? 'interactive' : 'rule';
  try {
    const result = mode === 'interactive'
      ? await withTimeout(processMessageLLM(content.trim(), priorMessages), AI_TIMEOUT_MS, 'AI response')
      : processMessageRules(content.trim(), priorMessages);
    const responseText = result.text;
    // Log AFTER generation to capture the answer. resolved is only meaningful
    // for the rule engine (it flags its own fallbacks); the interactive LLM
    // path has no cheap resolved signal, so leave it NULL (unknown).
    logAnalytics({
      userId: req.user.id, userEmail: req.user.email, source: 'chat', mode: analyticsMode,
      content: content.trim(), response: responseText,
      resolved: analyticsMode === 'rule' ? (result.resolved !== false) : null,
    }).catch(() => {});
    const inserted = await db.run('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?) RETURNING id', req.params.id, 'assistant', responseText);
    const msgCount = await db.get('SELECT COUNT(*) as cnt FROM messages WHERE chat_id = ?', req.params.id);
    let title = chat.title;
    if (msgCount.cnt <= 2 && chat.title === 'New Chat') {
      title = generateChatTitle(content.trim());
      await db.run('UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', title, req.params.id);
    } else {
      await db.run('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', req.params.id);
    }
    // Return the (possibly updated) title AND the new assistant message's id so
    // the client can refresh its sidebar entry and wire up thumbs up/down
    // without a second round-trip (M8).
    res.json({ response: responseText, title, messageId: inserted.lastInsertRowid });
  } catch (e) {
    console.error('Message processing error:', e);
    // Record the unanswered question (timeout/LLM error) so it still shows up.
    logAnalytics({
      userId: req.user.id, userEmail: req.user.email, source: 'chat', mode: analyticsMode,
      content: content.trim(), response: null, resolved: false,
    }).catch(() => {});
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// ─── Message feedback (thumbs up/down) ────────────────────────────────────────

app.put('/api/chats/:chatId/messages/:messageId/feedback', auth, perUserRouteLimit, async (req, res) => {
  const chat = await db.get('SELECT id FROM chats WHERE id = ? AND user_id = ?', req.params.chatId, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const message = await db.get('SELECT id, role FROM messages WHERE id = ? AND chat_id = ?', req.params.messageId, req.params.chatId);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.role !== 'assistant') return res.status(400).json({ error: 'Only assistant messages can be rated' });
  const rating = Number(req.body.rating);
  if (rating !== 1 && rating !== -1) return res.status(400).json({ error: 'rating must be 1 or -1' });
  await db.run(`
    INSERT INTO message_feedback (message_id, user_id, rating) VALUES (?, ?, ?)
    ON CONFLICT(message_id, user_id) DO UPDATE SET rating = excluded.rating, created_at = CURRENT_TIMESTAMP
  `, req.params.messageId, req.user.id, rating);
  res.json({ rating });
});

app.delete('/api/chats/:chatId/messages/:messageId/feedback', auth, perUserRouteLimit, async (req, res) => {
  const chat = await db.get('SELECT id FROM chats WHERE id = ? AND user_id = ?', req.params.chatId, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  await db.run('DELETE FROM message_feedback WHERE message_id = ? AND user_id = ?', req.params.messageId, req.user.id);
  res.json({ ok: true });
});

// ─── Overall-experience feedback (sidebar star rating + comment) ─────────────
// Open to guests as well as signed-in users — optionalAuth attaches user_id
// only when a valid token is present.

const FEEDBACK_MAX_LEN = 600; // "max a paragraph"

app.post('/api/feedback', ipRateLimit, optionalAuth, async (req, res) => {
  if (isBot(req)) {
    logSecurityEvent({ type: 'honeypot_triggered', req, email: req.user?.email });
    return res.json({ ok: true });
  }
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer from 1 to 5' });
  }
  // Strip control chars + angle brackets (same rule used for names/teacher fields elsewhere).
  const comment = String(req.body.comment ?? '').replace(/[\x00-\x1f<>]/g, '').trim().slice(0, FEEDBACK_MAX_LEN);
  await db.run(`
    INSERT INTO experience_feedback (user_id, user_email, rating, comment) VALUES (?, ?, ?, ?)
  `, req.user?.id ?? null, req.user?.email ?? null, rating, comment || null);
  res.json({ ok: true });
});

// ─── Teachers ─────────────────────────────────────────────────────────────────

app.get('/api/teachers', auth, perUserRouteLimit, (req, res) => {
  res.json(require('./data/teachers.json'));
});

// ─── Personal schedule (cloud-synced) ────────────────────────────────────────

// Schedule values are stored as { period: { room, teacher } }. We normalize on
// read so any legacy bare-string room values still load as { room, teacher:'' }.
app.get('/api/schedule', auth, perUserRouteLimit, async (req, res) => {
  const row = await db.get('SELECT data FROM schedules WHERE user_id = ?', req.user.id);
  let raw = {};
  if (row?.data) {
    try { raw = JSON.parse(row.data); } catch { raw = {}; }
  }
  const schedule = {};
  for (const [p, v] of Object.entries(raw)) {
    if (!/^[1-8]$/.test(p)) continue;
    schedule[p] = (v && typeof v === 'object')
      ? { room: String(v.room || ''), teacher: String(v.teacher || '') }
      : { room: String(v || ''), teacher: '' };
  }
  res.json({ schedule });
});

app.put('/api/schedule', auth, perUserRouteLimit, async (req, res) => {
  const incoming = req.body?.schedule;
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'schedule must be an object' });
  }
  // Sanitize: periods 1–8 only; room = up to 3 digits; teacher = trimmed text,
  // control chars + angle brackets stripped, capped at 60 chars. Accepts the legacy
  // bare-string room form too. Server is authoritative over what gets stored.
  const clean = {};
  for (const [period, val] of Object.entries(incoming)) {
    if (!/^[1-8]$/.test(period)) continue;
    let room = '', teacher = '';
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      room = String(val.room ?? '').replace(/[^0-9]/g, '').slice(0, 3);
      teacher = String(val.teacher ?? '').replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 60);
    } else {
      room = String(val ?? '').replace(/[^0-9]/g, '').slice(0, 3);
    }
    if (room || teacher) clean[period] = { room, teacher };
  }
  const data = JSON.stringify(clean);
  await db.run(`
    INSERT INTO schedules (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
  `, req.user.id, data);
  res.json({ schedule: clean });
});

// ─── Admin dashboard API ──────────────────────────────────────────────────────
// Every endpoint here is gated by adminRateLimit + adminAuth (a single shared
// ADMIN_KEY sent as x-admin-key — see the comment on ADMIN_KEY above for why
// this is not tied to the user/role system). adminAuth writes every attempt,
// successful or not, to admin_audit_log.
//
// These are READ-ONLY on purpose. The dashboard exists to answer "what are
// students asking, what did we fail to answer, is anything being flagged, and
// is anyone attacking us" — nothing here mutates application data, so a leaked
// key exposes information but cannot destroy or alter anything.
//
// Everything returned is bounded by pageParams (max 200 rows), because these
// tables grow with usage and an unbounded query would be both a memory hazard
// and a slow one.

const adminOnly = [adminRateLimit, adminAuth];

// Headline counters plus enough time-series to see whether usage is going up.
app.get('/api/admin/stats', ...adminOnly, async (req, res) => {
  try {
    const [users, chats, messages, questions, flagged, feedback, unresolved, last7, byMode, avgRating] =
      await Promise.all([
        db.get('SELECT COUNT(*)::int AS n FROM users'),
        db.get('SELECT COUNT(*)::int AS n FROM chats'),
        db.get('SELECT COUNT(*)::int AS n FROM messages'),
        db.get('SELECT COUNT(*)::int AS n FROM analytics_log'),
        db.get('SELECT COUNT(*)::int AS n FROM analytics_log WHERE flagged = 1'),
        db.get('SELECT COUNT(*)::int AS n FROM experience_feedback'),
        // resolved = 0 means the rule engine fell back; NULL means unknown
        // (the interactive path), so it is deliberately not counted here.
        db.get('SELECT COUNT(*)::int AS n FROM analytics_log WHERE resolved = 0'),
        db.all(`
          SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
          FROM analytics_log
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY day ORDER BY day
        `),
        db.all('SELECT mode, COUNT(*)::int AS n FROM analytics_log GROUP BY mode'),
        db.get('SELECT ROUND(AVG(rating)::numeric, 2) AS avg FROM experience_feedback'),
      ]);
    res.json({
      users: users.n,
      chats: chats.n,
      messages: messages.n,
      questions: questions.n,
      flagged: flagged.n,
      unresolved: unresolved.n,
      feedbackCount: feedback.n,
      averageRating: avgRating.avg === null ? null : Number(avgRating.avg),
      questionsPerDay: last7,
      questionsByMode: Object.fromEntries(byMode.map(r => [r.mode, r.n])),
      retentionDays: {
        analytics: ANALYTICS_RETENTION_DAYS,
        adminAudit: ADMIN_AUDIT_RETENTION_DAYS,
        securityEvents: SECURITY_EVENTS_RETENTION_DAYS,
      },
    });
  } catch (e) {
    console.error('Admin stats failed:', e.message);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

// A small helper so every list endpoint pages, orders and fails the same way.
function adminList(routePath, sql, label) {
  app.get(routePath, ...adminOnly, async (req, res) => {
    const { limit, offset } = pageParams(req);
    try {
      const rows = await db.all(sql, limit, offset);
      // hasMore lets the dashboard show "Load more" without a second COUNT(*)
      // over a table that only grows.
      res.json({ rows, limit, offset, hasMore: rows.length === limit });
    } catch (e) {
      console.error(`Admin ${label} failed:`, e.message);
      res.status(500).json({ error: `Could not load ${label}` });
    }
  });
}

adminList('/api/admin/questions', `
  SELECT id, user_email, source, mode, content, response, resolved, flagged, created_at
  FROM analytics_log ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
`, 'questions');

adminList('/api/admin/flagged', `
  SELECT id, user_email, source, mode, content, matched_words, created_at
  FROM analytics_log WHERE flagged = 1 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
`, 'flagged messages');

adminList('/api/admin/feedback', `
  SELECT id, user_email, rating, comment, created_at
  FROM experience_feedback ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
`, 'feedback');

adminList('/api/admin/audit-log', `
  SELECT id, ip, path, success, created_at
  FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
`, 'audit log');

adminList('/api/admin/security-events', `
  SELECT id, event_type, ip, email, path, detail, created_at
  FROM security_events ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
`, 'security events');

// ─── Route Finder ─────────────────────────────────────────────────────────────
// Open to everyone, including guests: it's a pure pathfinding lookup over static
// room-coordinate data, no user data touched and no external cost, so an
// account requirement would only be friction. IP-rate-limited like every other
// unauthenticated route.

const VALID_FLOORS = new Set([1, 2, 3]);

app.post('/api/route', ipRateLimit, (req, res) => {
  const { findPath, resolveRoom, labelFor } = require('./data/roomCoordinates');
  let fromKey, fromFloor, toKey, toFloor, fromLabel, toLabel;
  if (req.body.fromRoom !== undefined && req.body.fromFloor !== undefined) {
    // Reject anything that isn't a plain scalar before String()-ing it: an
    // object would stringify to "[object Object]" and an array to a comma list,
    // both of which then fail lookup with a confusing message instead of a
    // clean 400.
    if (!isScalar(req.body.fromRoom) || !isScalar(req.body.toRoom)) {
      return res.status(400).json({ error: 'fromRoom and toRoom must be text' });
    }
    fromKey = String(req.body.fromRoom).trim(); fromFloor = parseInt(req.body.fromFloor, 10);
    toKey = String(req.body.toRoom).trim(); toFloor = parseInt(req.body.toFloor, 10);
    if (!fromKey || !toKey) return res.status(400).json({ error: 'fromRoom, fromFloor, toRoom, toFloor are required' });
    // The building has three floors. Anything else has no map data at all, so
    // say so plainly rather than letting the pathfinder answer "no route" for
    // what is really a malformed request.
    if (!VALID_FLOORS.has(fromFloor) || !VALID_FLOORS.has(toFloor)) {
      return res.status(400).json({ error: 'fromFloor and toFloor must be 1, 2, or 3' });
    }
    // labelFor knows which destinations are numbered rooms and which are named
    // places, so the Courtyard doesn't come back as "Room Courtyard".
    fromLabel = labelFor(fromKey, fromFloor); toLabel = labelFor(toKey, toFloor);
  } else {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
    if (typeof from !== 'string' || typeof to !== 'string') {
      return res.status(400).json({ error: 'from and to must be text' });
    }
    const fromRoom = resolveRoom(from); const toRoom = resolveRoom(to);
    if (!fromRoom.coords) return res.status(404).json({ error: `Could not find coordinates for: ${from}` });
    if (!toRoom.coords) return res.status(404).json({ error: `Could not find coordinates for: ${to}` });
    fromKey = fromRoom.key; fromFloor = fromRoom.floor;
    toKey = toRoom.key; toFloor = toRoom.floor;
    fromLabel = from.replace(/\s*\(Floor\s*\d\)\s*$/i, '').trim();
    toLabel = to.replace(/\s*\(Floor\s*\d\)\s*$/i, '').trim();
  }
  try {
    const result = findPath(fromKey, fromFloor, toKey, toFloor);
    // findPath REPORTS an unroutable request (unknown room, disconnected
    // hallways) by returning an `error` field with empty paths — it does not
    // throw. Forwarding that as a 200 gave the client a "successful" route with
    // no waypoints, which every caller renders as "Route Found" over a blank
    // map. Surface it as the 404 it is so the UI shows a real error instead.
    if (result.error) {
      return res.status(404).json({
        error: `No route found between ${result.fromLabel || fromLabel} and ${result.toLabel || toLabel}.`,
      });
    }
    return res.json({
      sameFloor: result.sameFloor, fromFloor: result.fromFloor, toFloor: result.toFloor,
      fromLabel: result.fromLabel || fromLabel, toLabel: result.toLabel || toLabel,
      path1: result.path1, path2: result.path2, stairNum: result.stairNum,
      stairFromPos: result.stairFromPos, stairToPos: result.stairToPos,
    });
  } catch (err) {
    // An unexpected internal failure: log it, but never echo the raw message
    // back to the client (it leaks internals and reads as nonsense to a user).
    console.error('Route finder error:', err);
    return res.status(500).json({ error: 'Could not compute a route right now. Please try again.' });
  }
});

// ─── Pinned-point routing ─────────────────────────────────────────────────────
// The Route Finder's pin mode: either end of a trip can be a spot the student
// tapped on the floor plan rather than a room by name. Coordinates arrive in
// the blueprint space every route in this app is expressed in (2448x1584); the
// frontend converts from image pixels before sending, so this never has to know
// which drawing was on screen.
const BLUEPRINT_W = 2448;
const BLUEPRINT_H = 1584;

// One end of a trip: { kind: 'room', room, floor } or { kind: 'point', x, y, floor }.
function parseEndpoint(raw, which) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `${which} must be an object` };
  }
  const floor = parseInt(raw.floor, 10);
  if (!VALID_FLOORS.has(floor)) {
    return { error: `${which}.floor must be 1, 2, or 3` };
  }
  if (raw.kind === 'point') {
    const x = Number(raw.x), y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { error: `${which}.x and ${which}.y must be numbers` };
    }
    // Clamp rather than reject: a tap a few pixels outside the drawing is a
    // fat finger on the edge of a map, not a malformed request, and the
    // pathfinder projects onto the nearest hallway anyway.
    return {
      endpoint: {
        kind: 'point', floor,
        x: Math.min(Math.max(Math.round(x), 0), BLUEPRINT_W),
        y: Math.min(Math.max(Math.round(y), 0), BLUEPRINT_H),
      },
    };
  }
  if (raw.kind === 'room') {
    if (!isScalar(raw.room)) return { error: `${which}.room must be text` };
    const room = String(raw.room).trim();
    if (!room) return { error: `${which}.room is required` };
    return { endpoint: { kind: 'room', room, floor } };
  }
  return { error: `${which}.kind must be "room" or "point"` };
}

app.post('/api/route/pin', ipRateLimit, (req, res) => {
  const { findRoute, labelFor } = require('./data/roomCoordinates');

  const from = parseEndpoint(req.body.from, 'from');
  if (from.error) return res.status(400).json({ error: from.error });
  const to = parseEndpoint(req.body.to, 'to');
  if (to.error) return res.status(400).json({ error: to.error });

  const describe = (ep) => (ep.kind === 'room'
    ? labelFor(ep.room, ep.floor)
    : `Pinned spot on Floor ${ep.floor}`);

  try {
    const result = findRoute(from.endpoint, to.endpoint);
    if (result.error) {
      return res.status(404).json({
        error: `No route found between ${describe(from.endpoint)} and ${describe(to.endpoint)}.`,
      });
    }
    return res.json({
      sameFloor: result.sameFloor,
      fromFloor: result.fromFloor,
      toFloor:   result.toFloor,
      // A pin has no name of its own, so the server names it by floor rather
      // than echoing raw coordinates at the student.
      fromLabel: from.endpoint.kind === 'room' ? result.fromLabel : describe(from.endpoint),
      toLabel:   to.endpoint.kind   === 'room' ? result.toLabel   : describe(to.endpoint),
      path1: result.path1, path2: result.path2, stairNum: result.stairNum,
      stairFromPos: result.stairFromPos, stairToPos: result.stairToPos,
      meters: result.meters, minutes: result.minutes,
    });
  } catch (err) {
    console.error('Pin route error:', err);
    return res.status(500).json({ error: 'Could not compute a route right now. Please try again.' });
  }
});

// ─── Unknown API routes ───────────────────────────────────────────────────────
// This MUST come before the SPA catch-all below. Without it, in production a
// request to an endpoint that doesn't exist (a typo, an old client, a probe)
// fell through to the catch-all and got 200 + index.html — so a client saw a
// "successful" HTML response where it expected JSON, and any monitoring saw a
// broken endpoint as healthy.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Catch-all for React Router (production only) ─────────────────────────────

if (process.env.NODE_ENV === 'production') {
  // '/{*splat}' rather than '*': Express 5 uses path-to-regexp v8, which
  // rejects a bare '*' outright. This is the SPA catch-all — every path that is
  // not a real file and not /api/* has to return the shell so React Router can
  // handle it, which is what makes a deep link like /route work on a cold load.
  app.get('/{*splat}', (req, res) => {
    // The shell names the current asset hashes, so it must never be served
    // stale — otherwise a deploy leaves browsers asking for files that are
    // gone. Everything it points AT is immutable and cached for a year.
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  });
}

// Catch-all for any route handler that throws without its own try/catch —
// Express's default behavior for an uncaught error in an async handler is to
// hang the request or crash the process depending on version; this ensures a
// clean 500 instead, and logs it so a real bug doesn't fail silently.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // A malformed or oversized request body is the CLIENT's mistake, and
  // express.json() surfaces it here as a thrown error. Reporting it as a 500
  // told the caller the server was broken and buried a real signal in the
  // logs — and, because the frontend only shows `error` from a JSON body, the
  // user saw "Request failed (500)" instead of anything actionable.
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'That request was too large.' });
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ error: 'Malformed request body — expected JSON.' });
  }

  console.error('Unhandled request error:', err);
  res.status(500).json({ error: 'Server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
// Schema setup is awaited before the HTTP listener opens when the database is
// reachable, so the first request always sees a ready schema.

let server;

// If the database is unreachable at boot (a paused Supabase project, a network
// blip), the server still comes up: the Route Finder needs no database and is
// embedded in the school's IA phone app, so it must not go down with Postgres.
// Everything that does need the database fails per-request as it would during
// any outage, /api/health reports 503, and the schema setup keeps retrying.
const DB_INIT_RETRY_MS = 30_000;

async function initDbWithRetry() {
  try {
    await db.init();
    return true;
  } catch (e) {
    console.error(`⚠️  Database unavailable at startup (${e.message}). `
      + `Serving database-free routes; retrying every ${DB_INIT_RETRY_MS / 1000}s.`);
    const timer = setInterval(async () => {
      try {
        await db.init();
        clearInterval(timer);
        console.log('✅ Database connected.');
      } catch { /* still down; try again next tick */ }
    }, DB_INIT_RETRY_MS);
    timer.unref();
    return false;
  }
}

async function start() {
  await initDbWithRetry();
  // ── Socket timeouts (slowloris) ──
  // Node's defaults let a client open a connection, dribble out half a request,
  // and hold the socket forever. A few hundred of those tie the server up using
  // almost no bandwidth — the classic slowloris — and the same defaults let an
  // ordinary stuck client leak a connection.
  //
  // Two things about this are easy to get wrong, and both were, until a real
  // slowloris was run against it:
  //
  //  1. These must be passed at CONSTRUCTION. Assigning them to the server
  //     afterwards silently does almost nothing, because the timeouts are only
  //     CHECKED every `connectionsCheckingInterval` — which defaults to 30s.
  //  2. headersTimeout must be <= requestTimeout. Node throws if you construct
  //     it the other way round, and quietly misbehaves if you assign it.
  //
  // Hence http.createServer(options, app) rather than app.listen().
  const httpServer = http.createServer({
    connectionsCheckingInterval: 5_000,   // how often stalled sockets are reaped
    headersTimeout: 10_000,               // headers must arrive within 10s
    requestTimeout: 30_000,               // the whole request within 30s
    keepAliveTimeout: 65_000,             // longer than any upstream proxy's idle
                                          // timeout, so the proxy closes idle
                                          // sockets first — closing before it
                                          // does causes spurious 502s
  }, app);

  // Cap total sockets so a connection flood cannot exhaust file descriptors.
  httpServer.maxConnections = parseInt(process.env.MAX_CONNECTIONS, 10) || 10_000;

  server = httpServer;
  await new Promise((resolve) => {
    httpServer.listen(PORT, () => {
      console.log(`✅ IA Nexus backend running at http://localhost:${PORT}`);
      resolve();
    });
  });
}

start().catch((e) => {
  console.error('❌ Failed to start server:', e.message);
  process.exit(1);
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, THEN close the DB pool — instead of Render's restart/redeploy (or a
// crash) cutting connections out from under active requests.
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await db.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A crash from an unhandled error anywhere is better logged loudly and then
// exited (so Render's process supervisor restarts a clean instance) than left
// to Node's default behavior, which varies and can leave the process in an
// undefined half-alive state.
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
  process.exit(1);
});
