require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { sendResetCode, isEmailConfigured } = require('./email');

// LLM provider: Anthropic (Claude)
const { processMessage: processMessageLLM } = require('./chatbot-llm');
if (process.env.ANTHROPIC_API_KEY) {
  console.log('✅ Using Anthropic (Claude Haiku) as LLM provider');
} else {
  console.warn('⚠️  ANTHROPIC_API_KEY not set. Interactive mode will not work.');
}
const { processMessage: processMessageRules } = require('./chatbot-rules');

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
// CSP applies to the SPA that Express serves in production. It allows the Google
// Fonts stylesheet/fonts, inline styles (React inline style attributes), and
// same-origin scripts/connections. The API calls Anthropic server-side, so no
// external connect-src is needed from the browser.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  // Allow the SPA's own assets to load without COEP friction.
  crossOriginEmbedderPolicy: false,
}));

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }));
}

app.use(express.json({ limit: '64kb' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

// ─── Rate limiting (H1) ────────────────────────────────────────────────────────
// Schools sit behind a single NAT/public IP, so EVERY student shares one address.
// A tight per-IP cap would lock the whole school out. We therefore use a generous
// per-IP ceiling (gross-abuse protection) PLUS a strict per-email lockout on
// login that protects an individual account from brute force regardless of IP.
const RATE = {
  ipMax: 100, ipWindowMs: 60_000,           // generous shared-IP ceiling
  emailMax: 5, emailWindowMs: 15 * 60_000,  // per-account failed-login lockout
};

const ipAttempts = new Map();   // ip -> { count, resetAt }

// Per-user message limits (SEC-006): bound how OFTEN any one account can trigger a
// chat response — primarily to cap AI-provider cost in interactive mode. This is a
// frequency guard only; it does not alter how responses are generated.
const MSG_RATE = { perMin: 20, perHour: 150 };

// GLOBAL ceiling on paid interactive LLM calls across ALL users (audit H2). The
// per-user limit alone can't stop cost abuse via many free accounts, so this caps
// total spend regardless of how many accounts are involved. Rule-mode chat is not
// affected (it makes no external call).
const GLOBAL_AI = { perMin: 60, perHour: 1000 };
const aiGlobal = { minute: { count: 0, resetAt: 0 }, hour: { count: 0, resetAt: 0 } };

// Generous per-user ceiling applied to authenticated data routes (audit L4) so a
// single token can't hammer read/compute endpoints without bound. Keyed by user id
// (a school shares one NAT IP, so per-user is the right granularity).
const USER_ROUTE_RATE = { perMin: 240 };
const userRoute = new Map();   // userId -> { count, resetAt }
const MAX_MSG_LEN = 4000;      // cap chat message length (SEC-007) — generous for real use
const AI_TIMEOUT_MS = 25_000;  // graceful ceiling on the AI provider call (SEC-013)
const msgMinute = new Map();   // userId -> { count, resetAt }
const msgHour   = new Map();   // userId -> { count, resetAt }

// Password-reset email-bombing throttle (SEC-012): bound how often a reset email
// can be sent for any single address, independent of IP (a school shares one NAT).
// Keyed by a one-way hash of the email — never the raw address (privacy).
const RESET_EMAIL = { perHour: 4, minGapMs: 60_000 };
const resetThrottle = new Map(); // emailHash -> { count, resetAt, lastAt }
const emailKey = (email) => crypto.createHash('sha256').update(email).digest('hex');

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of ipAttempts) if (now > e.resetAt) ipAttempts.delete(k);
  for (const [k, e] of msgMinute) if (now > e.resetAt) msgMinute.delete(k);
  for (const [k, e] of msgHour)   if (now > e.resetAt) msgHour.delete(k);
  for (const [k, e] of userRoute) if (now > e.resetAt) userRoute.delete(k);
  for (const [k, e] of resetThrottle) if (now > e.resetAt) resetThrottle.delete(k);
  // Expired persisted login-lockout rows (audit L3).
  try { db.prepare('DELETE FROM login_throttle WHERE reset_at < ?').run(new Date(now).toISOString()); } catch { /* ignore */ }
}, 5 * 60_000).unref();

// Returns true if a reset email may be sent now for this address (and records it).
function resetEmailAllowed(normalizedEmail) {
  const now = Date.now();
  const key = emailKey(normalizedEmail);
  const e = resetThrottle.get(key) || { count: 0, resetAt: now + 60 * 60_000, lastAt: 0 };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + 60 * 60_000; e.lastAt = 0; }
  if (now - e.lastAt < RESET_EMAIL.minGapMs) return false;   // too soon since last send
  if (e.count >= RESET_EMAIL.perHour) return false;          // hourly cap reached
  e.count++; e.lastAt = now;
  resetThrottle.set(key, e);
  return true;
}

// Periodically purge expired password-reset codes so the table doesn't grow (L7).
setInterval(() => {
  try {
    db.prepare('DELETE FROM password_reset_codes WHERE expires_at < ?').run(new Date().toISOString());
  } catch (e) {
    console.error('Reset-code cleanup failed:', e.message);
  }
}, 60 * 60_000).unref();

function ipRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = ipAttempts.get(ip) || { count: 0, resetAt: now + RATE.ipWindowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE.ipWindowMs; }
  entry.count++;
  ipAttempts.set(ip, entry);
  if (entry.count > RATE.ipMax) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  next();
}

// Per-account failed-login lockout, persisted in SQLite so a restart/redeploy
// can't clear an active lockout (audit L3).
function isEmailLocked(email) {
  const e = db.prepare('SELECT count, reset_at FROM login_throttle WHERE email = ?').get(email);
  if (!e) return false;
  if (Date.now() > new Date(e.reset_at).getTime()) {
    db.prepare('DELETE FROM login_throttle WHERE email = ?').run(email);
    return false;
  }
  return e.count >= RATE.emailMax;
}
function registerEmailFailure(email) {
  const now = Date.now();
  const e = db.prepare('SELECT count, reset_at FROM login_throttle WHERE email = ?').get(email);
  if (!e || now > new Date(e.reset_at).getTime()) {
    const resetAt = new Date(now + RATE.emailWindowMs).toISOString();
    db.prepare(`
      INSERT INTO login_throttle (email, count, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(email) DO UPDATE SET count = 1, reset_at = excluded.reset_at
    `).run(email, resetAt);
  } else {
    db.prepare('UPDATE login_throttle SET count = count + 1 WHERE email = ?').run(email);
  }
}
function clearEmailFailures(email) {
  db.prepare('DELETE FROM login_throttle WHERE email = ?').run(email);
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    // Server-side revocation (audit H1): the token is only valid if it matches the
    // account's current token_version. Bumping that version (on password change,
    // reset, or account deletion) invalidates every previously-issued token, and a
    // token for a deleted account no longer resolves to a row.
    const current = db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.id);
    if (!current || (payload.tv ?? 0) !== current.token_version) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Reserve one slot against the global interactive-LLM budget (audit H2). Returns
// { ok, retryAfter }. Only called on the paid interactive path.
function reserveGlobalAiSlot() {
  const now = Date.now();
  for (const [window, max] of [['minute', GLOBAL_AI.perMin], ['hour', GLOBAL_AI.perHour]]) {
    const span = window === 'minute' ? 60_000 : 60 * 60_000;
    const e = aiGlobal[window];
    if (now > e.resetAt) { e.count = 0; e.resetAt = now + span; }
    if (e.count >= max) return { ok: false, retryAfter: Math.max(1, Math.ceil((e.resetAt - now) / 1000)) };
  }
  aiGlobal.minute.count++;
  aiGlobal.hour.count++;
  return { ok: true };
}

// Generous per-user frequency guard for authenticated data routes (audit L4).
function perUserRouteLimit(req, res, next) {
  const { ok, retryAfter } = bumpCounter(userRoute, req.user.id, 60_000, USER_ROUTE_RATE.perMin);
  if (!ok) {
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
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

// Increment a windowed counter and report whether it's still within `max`.
function bumpCounter(map, key, windowMs, max) {
  const now = Date.now();
  const e = map.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + windowMs; }
  e.count++;
  map.set(key, e);
  return { ok: e.count <= max, retryAfter: Math.max(1, Math.ceil((e.resetAt - now) / 1000)) };
}

// Per-user frequency guard for the chat-message endpoint (SEC-006). Runs AFTER
// `auth`, so req.user is set. Returns 429 when a single account sends too many
// messages too quickly; it never changes the chatbot/AI response itself.
function perUserMessageLimit(req, res, next) {
  const uid = req.user.id;
  const minute = bumpCounter(msgMinute, uid, 60_000, MSG_RATE.perMin);
  if (!minute.ok) {
    res.set('Retry-After', String(minute.retryAfter));
    return res.status(429).json({ error: 'You’re sending messages too quickly. Please wait a moment.' });
  }
  const hour = bumpCounter(msgHour, uid, 60 * 60_000, MSG_RATE.perHour);
  if (!hour.ok) {
    res.set('Retry-After', String(hour.retryAfter));
    return res.status(429).json({ error: 'Hourly message limit reached. Please try again later.' });
  }
  next();
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

app.post('/api/auth/signup', ipRateLimit, async (req, res) => {
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
    db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email.toLowerCase(), hash, cleanName);
    res.json({ message: 'Account created successfully' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', ipRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const normalizedEmail = email.toLowerCase();
  // Per-account lockout protects an individual account from brute force even when
  // many users share one school IP (H1).
  if (isEmailLocked(normalizedEmail)) {
    return res.status(429).json({ error: 'Too many failed attempts for this account. Please try again in a few minutes.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  // Constant-time comparison (audit M1): always run bcrypt.compare — against a
  // fixed dummy hash when the account doesn't exist — so response timing doesn't
  // reveal whether an email is registered.
  const valid = await bcrypt.compare(password, user ? user.password : DUMMY_BCRYPT_HASH);
  if (!user || !valid) {
    registerEmailFailure(normalizedEmail);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  clearEmailFailures(normalizedEmail);
  const token = jwt.sign({ id: user.id, email: user.email, tv: user.token_version ?? 0 }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, email: user.email, name: user.name || '' });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.user.id);
  res.json({ id: req.user.id, email: req.user.email, name: user?.name || '' });
});

// Update display name
app.post('/api/auth/profile', auth, (req, res) => {
  // Strip control chars + angle brackets (audit L2) — same rule as signup.
  const cleanName = (req.body.name == null ? '' : String(req.body.name)).replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 60) || null;
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(cleanName, req.user.id);
  res.json({ name: cleanName || '' });
});

// Change password (while signed in) — verifies the current password first
app.post('/api/auth/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const hash = await bcrypt.hash(newPassword, 10);
  // Bump token_version to revoke every previously-issued session token (audit H1),
  // then mint a fresh token so the CURRENT tab stays signed in while any OTHER
  // outstanding sessions are invalidated.
  const newTv = (user.token_version ?? 0) + 1;
  db.prepare('UPDATE users SET password = ?, token_version = ? WHERE id = ?').run(hash, newTv, req.user.id);
  const token = jwt.sign({ id: user.id, email: user.email, tv: newTv }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ message: 'Password changed successfully', token });
});

// Delete account — removes the user and all of their chats/messages/codes
app.delete('/api/auth/account', auth, (req, res) => {
  const uid = req.user.id;
  const chatIds = db.prepare('SELECT id FROM chats WHERE user_id = ?').all(uid).map(c => c.id);
  for (const cid of chatIds) db.prepare('DELETE FROM messages WHERE chat_id = ?').run(cid);
  db.prepare('DELETE FROM chats WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM password_reset_codes WHERE user_id = ?').run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  res.json({ message: 'Account deleted' });
});

app.post('/api/auth/forgot-password', ipRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const generic = { message: 'If an account exists for this email, a verification code has been sent.' };
  const normalizedEmail = email.toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) return res.json(generic);
  // Throttle reset emails per-address to prevent inbox-bombing / send-cost abuse.
  // Still return the generic message so existence is never revealed (SEC-012).
  if (!resetEmailAllowed(normalizedEmail)) return res.json(generic);
  db.prepare('DELETE FROM password_reset_codes WHERE user_id = ?').run(user.id);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = bcrypt.hashSync(code, 10);
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60_000).toISOString();
  db.prepare('INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)').run(user.id, codeHash, expiresAt);
  try {
    await sendResetCode(user.email, code, RESET_CODE_TTL_MIN);
  } catch (e) {
    console.error('Failed to send reset email:', e.message);
  }
  res.json(generic);
});

app.post('/api/auth/verify-code', ipRateLimit, (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
  const record = db.prepare('SELECT * FROM password_reset_codes WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1').get(user.id);
  if (!record) return res.status(400).json({ error: 'Invalid or expired code. Please request a new one.' });
  if (new Date(record.expires_at) < new Date()) {
    db.prepare('DELETE FROM password_reset_codes WHERE id = ?').run(record.id);
    return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    db.prepare('UPDATE password_reset_codes SET used = 1 WHERE id = ?').run(record.id);
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
  }
  const match = bcrypt.compareSync(String(code), record.code_hash);
  if (!match) {
    db.prepare('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id);
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

app.post('/api/auth/reset-password', (req, res) => {
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
  const record = db.prepare('SELECT * FROM password_reset_codes WHERE id = ? AND user_id = ?').get(payload.codeId, payload.uid);
  if (!record || record.used) return res.status(400).json({ error: 'This reset request is no longer valid. Please start over.' });
  if (new Date(record.expires_at) < new Date()) {
    db.prepare('DELETE FROM password_reset_codes WHERE id = ?').run(record.id);
    return res.status(400).json({ error: 'Reset request expired. Please start over.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  // Revoke all outstanding session tokens on reset (audit H1) — a reset commonly
  // follows a suspected compromise, so old tokens must stop working.
  db.prepare('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?').run(hash, payload.uid);
  db.prepare('UPDATE password_reset_codes SET used = 1 WHERE id = ?').run(record.id);
  res.json({ message: 'Password reset successfully' });
});

// ─── Chats ───────────────────────────────────────────────────────────────────

app.get('/api/chats', auth, (req, res) => {
  const chats = db.prepare(`
    SELECT c.id, c.title, c.updated_at,
      (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM chats c WHERE c.user_id = ? ORDER BY c.updated_at DESC
  `).all(req.user.id);
  res.json(chats);
});

app.post('/api/chats', auth, (req, res) => {
  const { title } = req.body;
  const result = db.prepare('INSERT INTO chats (user_id, title) VALUES (?, ?)').run(req.user.id, title || 'New Chat');
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(result.lastInsertRowid);
  res.json(chat);
});

app.patch('/api/chats/:id', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const title = String(req.body.title ?? '').trim().slice(0, 80);   // bound length (SEC-011)
  if (!title) return res.status(400).json({ error: 'Title required' });
  db.prepare('UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, req.params.id);
  res.json({ ok: true });
});

// Clear ALL conversations for the signed-in user
app.delete('/api/chats', auth, (req, res) => {
  const uid = req.user.id;
  const chatIds = db.prepare('SELECT id FROM chats WHERE user_id = ?').all(uid).map(c => c.id);
  for (const cid of chatIds) db.prepare('DELETE FROM messages WHERE chat_id = ?').run(cid);
  db.prepare('DELETE FROM chats WHERE user_id = ?').run(uid);
  res.json({ ok: true });
});

app.delete('/api/chats/:id', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  db.prepare('DELETE FROM messages WHERE chat_id = ?').run(req.params.id);
  db.prepare('DELETE FROM chats WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Messages ─────────────────────────────────────────────────────────────────

app.get('/api/chats/:id/messages', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const messages = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(messages);
});

app.post('/api/chats/:id/messages', auth, perUserMessageLimit, async (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const { content, mode } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });
  if (content.trim().length > MAX_MSG_LEN) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MSG_LEN} characters).` });
  }
  // Global budget guard for the PAID interactive path (audit H2). Reserve a slot
  // before persisting anything so a rejected request leaves no orphan message.
  if (mode === 'interactive') {
    const slot = reserveGlobalAiSlot();
    if (!slot.ok) {
      res.set('Retry-After', String(slot.retryAfter));
      return res.status(429).json({ error: 'The assistant is busy right now. Please try again shortly.' });
    }
  }
  db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').run(req.params.id, 'user', content.trim());
  try {
    const result = mode === 'interactive'
      ? await withTimeout(processMessageLLM(content.trim()), AI_TIMEOUT_MS, 'AI response')
      : processMessageRules(content.trim());
    const responseText = result.text;
    db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').run(req.params.id, 'assistant', responseText);
    const msgCount = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE chat_id = ?').get(req.params.id);
    let title = chat.title;
    if (msgCount.cnt <= 2 && chat.title === 'New Chat') {
      title = generateChatTitle(content.trim());
      db.prepare('UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, req.params.id);
    } else {
      db.prepare('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    }
    // Return the (possibly updated) title so the client can refresh its sidebar
    // entry without a second round-trip to GET /api/chats (M8).
    res.json({ response: responseText, title });
  } catch (e) {
    console.error('Message processing error:', e);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// ─── Teachers ─────────────────────────────────────────────────────────────────

app.get('/api/teachers', auth, perUserRouteLimit, (req, res) => {
  res.json(require('./data/teachers.json'));
});

// ─── Personal schedule (cloud-synced) ────────────────────────────────────────

// Schedule values are stored as { period: { room, teacher } }. We normalize on
// read so any legacy bare-string room values still load as { room, teacher:'' }.
app.get('/api/schedule', auth, perUserRouteLimit, (req, res) => {
  const row = db.prepare('SELECT data FROM schedules WHERE user_id = ?').get(req.user.id);
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

app.put('/api/schedule', auth, perUserRouteLimit, (req, res) => {
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
      teacher = String(val.teacher ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
    } else {
      room = String(val ?? '').replace(/[^0-9]/g, '').slice(0, 3);
    }
    if (room || teacher) clean[period] = { room, teacher };
  }
  const data = JSON.stringify(clean);
  db.prepare(`
    INSERT INTO schedules (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, data);
  res.json({ schedule: clean });
});

// ─── Route Finder ─────────────────────────────────────────────────────────────

app.post('/api/route', auth, perUserRouteLimit, (req, res) => {
  const { findPath, resolveRoom } = require('./data/roomCoordinates');
  let fromKey, fromFloor, toKey, toFloor, fromLabel, toLabel;
  if (req.body.fromRoom !== undefined && req.body.fromFloor !== undefined) {
    fromKey = String(req.body.fromRoom); fromFloor = parseInt(req.body.fromFloor, 10);
    toKey = String(req.body.toRoom); toFloor = parseInt(req.body.toFloor, 10);
    if (!fromKey || !toKey || !fromFloor || !toFloor) return res.status(400).json({ error: 'fromRoom, fromFloor, toRoom, toFloor are required' });
    fromLabel = `Room ${fromKey}`; toLabel = `Room ${toKey}`;
  } else {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
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
    return res.json({
      sameFloor: result.sameFloor, fromFloor: result.fromFloor, toFloor: result.toFloor,
      fromLabel: result.fromLabel || fromLabel, toLabel: result.toLabel || toLabel,
      path1: result.path1, path2: result.path2, stairNum: result.stairNum,
      stairFromPos: result.stairFromPos, stairToPos: result.stairToPos,
    });
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }
});

// ─── Catch-all for React Router (production only) ─────────────────────────────

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ IA Nexus backend running at http://localhost:${PORT}`);
});
