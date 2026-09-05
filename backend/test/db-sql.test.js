'use strict';

// toPgSql rewrites bare table names so every statement is schema-qualified,
// because Supabase's pooler runs PgBouncer in transaction mode and will not
// reliably keep a session-level `search_path` attached between queries.
//
// The rewrite used to happen ANYWHERE the name appeared, including inside a
// string literal, and that shipped as a real bug: the migration's
// `WHERE table_name = 'users'` became `WHERE table_name = "schema".users`, so
// it never found the column it was checking for. These tests pin the rule down.

const { test } = require('node:test');
const assert = require('node:assert');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user@example.invalid:5432/db';

function withSchema(schema) {
  const key = require.resolve('../db.js');
  delete require.cache[key];
  const prev = process.env.DB_SCHEMA;
  process.env.DB_SCHEMA = schema;
  const mod = require('../db.js');
  if (prev === undefined) delete process.env.DB_SCHEMA; else process.env.DB_SCHEMA = prev;
  delete require.cache[key];
  return mod.toPgSql;
}

const q = withSchema('demo');
const pub = withSchema('public');

test('every position that names a table is qualified', () => {
  const cases = [
    ['SELECT * FROM users WHERE email = ?', 'SELECT * FROM "demo".users WHERE email = $1'],
    ['SELECT c.id FROM chats c LEFT JOIN message_feedback mf ON mf.user_id = ?',
     'SELECT c.id FROM "demo".chats c LEFT JOIN "demo".message_feedback mf ON mf.user_id = $1'],
    ['INSERT INTO messages (chat_id) VALUES (?)', 'INSERT INTO "demo".messages (chat_id) VALUES ($1)'],
    ['UPDATE users SET name = ?', 'UPDATE "demo".users SET name = $1'],
    ['DELETE FROM rate_limits WHERE reset_at < NOW()', 'DELETE FROM "demo".rate_limits WHERE reset_at < NOW()'],
    ['ALTER TABLE users ADD COLUMN x TEXT', 'ALTER TABLE "demo".users ADD COLUMN x TEXT'],
    ['CREATE TABLE IF NOT EXISTS users (id SERIAL)', 'CREATE TABLE IF NOT EXISTS "demo".users (id SERIAL)'],
    ['CREATE INDEX IF NOT EXISTS idx_c ON chats (user_id)', 'CREATE INDEX IF NOT EXISTS idx_c ON "demo".chats (user_id)'],
    ['user_id INTEGER REFERENCES users(id) ON DELETE CASCADE',
     'user_id INTEGER REFERENCES "demo".users(id) ON DELETE CASCADE'],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(q(input), expected);
  }
});

// The bug this file exists for.
test('a table name inside a string literal is left alone', () => {
  const sql = "SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = 'users'";
  const out = q(sql);
  assert.ok(out.includes("table_name = 'users'"),
    `the string literal was rewritten, which is what broke the migration check: ${out}`);
  assert.ok(!out.includes('"demo".users'), out);
});

// Postgres resolves the bare target-table name inside ON CONFLICT DO UPDATE, so
// qualifying it there is unnecessary; leaving it is correct.
test('a qualified column reference in ON CONFLICT is not mangled', () => {
  const sql = 'INSERT INTO rate_limits (key) VALUES (?) ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1';
  const out = q(sql);
  assert.ok(out.includes('INSERT INTO "demo".rate_limits'), out);
  assert.ok(out.includes('SET count = rate_limits.count + 1'), out);
});

test('a column whose name contains a table name is not rewritten', () => {
  // e.g. a future `users_count` column, or `analytics_log_id`.
  assert.strictEqual(q('SELECT users_count FROM chats'), 'SELECT users_count FROM "demo".chats');
  assert.strictEqual(q('SELECT id FROM chats WHERE messages_seen > ?'),
    'SELECT id FROM "demo".chats WHERE messages_seen > $1');
});

test('the public schema is left completely untouched', () => {
  const sql = 'SELECT * FROM users WHERE email = ? AND id = ?';
  assert.strictEqual(pub(sql), 'SELECT * FROM users WHERE email = $1 AND id = $2');
});

test('placeholders are numbered in order, in both modes', () => {
  const sql = 'INSERT INTO users (a, b, c) VALUES (?, ?, ?)';
  assert.ok(q(sql).endsWith('VALUES ($1, $2, $3)'));
  assert.ok(pub(sql).endsWith('VALUES ($1, $2, $3)'));
});
