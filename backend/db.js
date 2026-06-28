const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Database file location. Defaults to a local file for development; in
// production set DB_PATH to a path on a persistent disk (see render.yaml) so
// user data survives restarts and redeploys. Schema and queries are unchanged.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'nexus.db');
const db = new DatabaseSync(dbPath);

// Concurrency + integrity pragmas (Phase 9 hardening):
//  - WAL: readers don't block the writer → better throughput under load.
//  - foreign_keys ON: make ON DELETE CASCADE authoritative for account deletion
//    (explicit, so a future runtime default change can't silently orphan data).
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_reset_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- One personal class schedule per user, stored as a JSON object of
  -- { "<period>": "<room>" }. Synced across the user's devices.
  CREATE TABLE IF NOT EXISTS schedules (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec('DROP TABLE IF EXISTS password_reset_tokens;');

// Migration: add an optional display name to existing user tables
const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some(c => c.name === 'name')) {
  db.exec('ALTER TABLE users ADD COLUMN name TEXT');
}

module.exports = db;
