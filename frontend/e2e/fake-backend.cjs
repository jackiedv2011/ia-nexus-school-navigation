// Boots the REAL backend with only the `db` module replaced, so the end-to-end
// tests exercise the actual server — routing, rate limiting, validation, the
// pathfinder — without needing a Postgres. Anything that genuinely depends on
// stored data (accounts, chat history) is out of scope for these tests and is
// covered by backend/test/security.test.js against a real database.
const path = require('node:path');

const BACKEND = path.join(__dirname, '..', '..', 'backend');
const dbPath = require.resolve(path.join(BACKEND, 'db.js'));

const store = { schedule: null };

require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    get: async (sql) => {
      if (/rate_limits/.test(sql)) return { count: 1, reset_at: new Date(Date.now() + 60_000).toISOString() };
      if (/SELECT 1/.test(sql)) return { '?column?': 1 };
      if (/AVG\(rating\)/.test(sql)) return { avg: '4.50' };
      if (/COUNT\(\*\)/.test(sql)) return { n: 12 };
      if (/FROM schedules/.test(sql)) return store.schedule ? { data: store.schedule } : undefined;
      return undefined;
    },
    all: async (sql, ...params) => {
      if (/GROUP BY day/.test(sql)) return [
        { day: '2026-09-01', n: 3 }, { day: '2026-09-02', n: 8 }, { day: '2026-09-03', n: 5 },
      ];
      if (/GROUP BY mode/.test(sql)) return [{ mode: 'rule', n: 10 }, { mode: 'interactive', n: 2 }];
      if (/FROM analytics_log/.test(sql)) return [{
        id: 1, user_email: null, source: 'guest', mode: 'rule',
        content: 'How do I get from room 188 to room 331?',
        response: 'Room 188 -> Room 331', resolved: 1, flagged: 0,
        matched_words: null, created_at: new Date().toISOString(),
      }];
      if (/FROM experience_feedback/.test(sql)) return [{
        id: 1, user_email: null, rating: 5, comment: 'Very useful', created_at: new Date().toISOString(),
      }];
      if (/FROM admin_audit_log/.test(sql)) return [{
        id: 1, ip: '127.0.0.1', path: '/api/admin/stats', success: 1, created_at: new Date().toISOString(),
      }];
      if (/FROM security_events/.test(sql)) return [{
        id: 1, event_type: 'login_failed', ip: '127.0.0.1', email: 'x@example.com',
        path: '/api/auth/login', detail: null, created_at: new Date().toISOString(),
      }];
      return [];
    },
    run: async (sql, ...params) => {
      if (/INSERT INTO schedules/.test(sql)) store.schedule = params[1];
      return { changes: 1, rows: [], lastInsertRowid: 1 };
    },
    init: async () => {}, close: async () => {},
    query: async () => ({ rows: [] }),
    pool: {}, SCHEMA: 'public',
  },
};

require(path.join(BACKEND, 'server.js'));
