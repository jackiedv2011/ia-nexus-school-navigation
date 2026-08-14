const { Pool } = require('pg');

// Postgres (Supabase) replaces the old node:sqlite file. DATABASE_URL is
// required — there is no local-file fallback, so a missing/wrong value fails
// loudly at boot instead of silently writing to a throwaway file.
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL must be set. Refusing to start.');
  process.exit(1);
}

// Optional schema isolation: set DB_SCHEMA to run against a dedicated schema
// instead of "public" (used by the test suite to get a throwaway, disposable
// namespace on the same Supabase project — the equivalent of the old
// throwaway-sqlite-file trick, since Postgres doesn't have per-test files).
const SCHEMA = process.env.DB_SCHEMA || 'public';
const schemaIdent = '"' + SCHEMA.replace(/"/g, '') + '"';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Bounded rather than left at library defaults — Supabase's pooler has a
  // real cap on concurrent backend connections, and an unbounded pool from
  // one instance can starve that budget on its own before traffic is even
  // the bottleneck. Configurable via DB_POOL_MAX because the right ceiling
  // depends on your actual Supabase plan (Dashboard -> Project Settings ->
  // Database -> Connection pooling shows the real limit) — 20 roughly
  // doubles concurrent query throughput over the previous hardcoded 10
  // without risking exhausting a free-tier pooler's connection budget.
  // Load-tested locally: at max=10, 100 concurrent requests to a trivial
  // query showed p50=507ms/p95=882ms from queuing alone: doubling the pool
  // directly reduces that queuing.
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // A stuck/runaway query holds a connection (and its slot in the pool)
  // forever without this — one bad query could otherwise slowly starve the
  // whole pool.
  statement_timeout: 15_000,
});
pool.on('error', (err) => {
  // A background/idle client error must not crash the whole process.
  console.error('Postgres pool error:', err.message);
});

// Every table this app has. Used to fully-qualify table names with the target
// schema in every query (see toPgSql below) instead of relying on a
// session-level `SET search_path`. That would be simpler, but Supabase's
// connection-pooler URL runs in PgBouncer "transaction" mode, which does NOT
// reliably keep session state (like search_path) attached across separate
// transactions on the same logical connection — it can silently swap the
// underlying backend between queries, so a `SET search_path` from an earlier
// query has no guarantee of still applying to the next one. Fully-qualifying
// every statement sidesteps that pooling behavior entirely.
const TABLES = [
  'users', 'chats', 'messages', 'password_reset_codes', 'schedules',
  'login_throttle', 'message_feedback', 'experience_feedback',
  'analytics_log', 'rate_limits', 'admin_audit_log', 'security_events',
];
const tableRe = new RegExp(`\\b(${TABLES.join('|')})\\b`, 'g');

// Convert SQLite-style "?" positional placeholders to Postgres "$1, $2, ..."
// so every existing query string can be reused almost unchanged (safe here —
// none of this app's SQL text contains a literal "?" character), and qualify
// bare table names with the target schema.
function toPgSql(sql) {
  let i = 0;
  const withPlaceholders = sql.replace(/\?/g, () => `$${++i}`);
  if (SCHEMA === 'public') return withPlaceholders;
  return withPlaceholders.replace(tableRe, `${schemaIdent}.$1`);
}

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(toPgSql(sql), params);
  } finally {
    client.release();
  }
}

async function get(sql, ...params) {
  const { rows } = await query(sql, params);
  return rows[0];
}

async function all(sql, ...params) {
  const { rows } = await query(sql, params);
  return rows;
}

// Mirrors the shape better-sqlite3's `.run()` returned (lastInsertRowid,
// changes) so call sites that need the inserted id just add `RETURNING id`
// to their SQL text — everything else about the call stays the same.
async function run(sql, ...params) {
  const result = await query(sql, params);
  return {
    lastInsertRowid: result.rows[0]?.id,
    changes: result.rowCount,
    rows: result.rows,
  };
}

async function init() {
  if (SCHEMA !== 'public') {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaIdent}`);
  }
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      token_version INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- expires_at/reset_at stay TEXT (ISO 8601) rather than TIMESTAMPTZ: the
    -- app computes and compares them as strings/Date objects in JS, and
    -- ISO 8601 sorts lexicographically the same as chronologically, so this
    -- carries over the exact original behavior with zero type-cast risk.
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- One personal class schedule per user, stored as a JSON object of
    -- { "<period>": "<room>" }. Synced across the user's devices.
    CREATE TABLE IF NOT EXISTS schedules (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Per-account failed-login lockout, persisted so a process restart/redeploy
    -- can't silently clear a brute-force lockout. Keyed by lowercased email;
    -- rows self-expire (reset_at) and are cleared on a successful login.
    CREATE TABLE IF NOT EXISTS login_throttle (
      email TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at TEXT NOT NULL
    );

    -- Thumbs up/down on a saved assistant message. One rating per (message,
    -- user) — re-rating updates it, un-rating deletes the row.
    CREATE TABLE IF NOT EXISTS message_feedback (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating IN (1, -1)),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );

    -- Overall-experience feedback from the sidebar (star rating + free-text
    -- comment). Open to guests too, so user_id is nullable.
    CREATE TABLE IF NOT EXISTS experience_feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Analytics/moderation log: one row per user message sent to the chatbot
    -- (both guest and signed-in), independent of the "messages" table used to
    -- render chat history. Powers the admin dashboard's question feed and
    -- profanity-flag review. user_email is denormalized so a moderation record
    -- survives account deletion even though user_id is nulled out.
    CREATE TABLE IF NOT EXISTS analytics_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT,
      source TEXT NOT NULL CHECK(source IN ('guest', 'chat')),
      mode TEXT NOT NULL CHECK(mode IN ('rule', 'interactive')),
      content TEXT NOT NULL,
      response TEXT,
      resolved INTEGER,
      flagged INTEGER NOT NULL DEFAULT 0,
      matched_words TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Rate-limit counters, moved out of in-memory Maps so limits hold up
    -- across process restarts and (if ever needed) multiple server instances,
    -- instead of each process independently forgetting/re-counting from zero.
    -- One row per limiter key, e.g. "ip:1.2.3.4" or "msgmin:42".
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at TIMESTAMPTZ NOT NULL
    );

    -- Every hit against the admin dashboard's API — success AND failure. There
    -- is no per-admin identity (ADMIN_KEY is one shared secret), so this can't
    -- say WHO looked, only that the dashboard WAS accessed, from where, and
    -- when — which is still the difference between "we can prove nobody
    -- looked while the key was exposed" and having no idea either way.
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      ip TEXT,
      path TEXT NOT NULL,
      success INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- General attack/abuse signal log — failed logins, rate-limit trips,
    -- honeypot triggers, locked-account attempts, rejected admin-key attempts.
    -- Distinct from admin_audit_log (that's specifically dashboard access);
    -- this is "is someone attacking us" visibility across the whole app.
    -- event_type is free text rather than a CHECK-constrained enum so a new
    -- event type can be added at a call site without a migration.
    CREATE TABLE IF NOT EXISTS security_events (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      ip TEXT,
      email TEXT,
      path TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Migration: email_verified was added to an already-existing `users` table —
  // CREATE TABLE IF NOT EXISTS above is a no-op on a table that already
  // exists, so the column has to be added explicitly for any database that
  // was created before this column existed.
  //
  // 'users' is passed as a QUERY PARAMETER here, not embedded in the SQL text
  // — toPgSql's table-qualifying regex rewrites bare occurrences of table
  // names anywhere in the SQL string, including inside a string literal like
  // 'users', which would otherwise mangle this exact-match comparison and
  // make it never find the column (this shipped once, caught by the test
  // suite's schema-per-run isolation surfacing it immediately).
  const cols = await all(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
    SCHEMA, 'users',
  );
  if (!cols.some(c => c.column_name === 'email_verified')) {
    await query('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  }

  // Migration: response + resolved were added to analytics_log after it first
  // shipped, so the admin dashboard could show the bot's ANSWER (not just the
  // question) and flag questions the rule engine couldn't resolve. Both are
  // nullable — older rows and interactive/LLM turns simply carry NULL. Same
  // query-parameter caveat as above re: toPgSql's table-name rewriting.
  const analyticsCols = await all(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
    SCHEMA, 'analytics_log',
  );
  if (!analyticsCols.some(c => c.column_name === 'response')) {
    await query('ALTER TABLE analytics_log ADD COLUMN response TEXT');
  }
  if (!analyticsCols.some(c => c.column_name === 'resolved')) {
    await query('ALTER TABLE analytics_log ADD COLUMN resolved INTEGER');
  }
}

// Closes the pool cleanly — used on graceful shutdown (SIGTERM/SIGINT) so
// in-flight queries get a chance to finish instead of connections being cut
// out from under them.
async function close() {
  await pool.end();
}

module.exports = { pool, query, get, all, run, init, close, SCHEMA };
