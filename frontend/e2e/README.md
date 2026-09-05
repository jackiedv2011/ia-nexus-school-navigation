# End-to-end tests

These drive a real browser against the real application.

## What is real, and what isn't

Real: the Vite dev server and its `/api` proxy, the whole React app, the actual
Express backend — its middleware chain, rate limiting, input validation, and the
pathfinder.

Stubbed: **only** `backend/db.js` (see `fake-backend.cjs`). Postgres is the one
dependency that cannot be assumed present in CI, and stubbing it is what lets
these tests exercise everything above it on every push.

That boundary means these tests deliberately do **not** cover anything needing
real stored accounts — signup, login, chat history, the personal schedule. Those
are covered at the API level by `backend/test/security.test.js`, which runs
against a throwaway schema on a real Postgres when `DATABASE_URL` is set.

## Running them

```bash
npm run test:e2e                  # starts both servers itself
npm run test:e2e -- --headed      # watch it happen
npm run test:e2e -- --debug       # step through
```

If Playwright's bundled Chromium version doesn't match one already installed on
the machine, point at the existing binary instead of downloading:

```bash
PW_CHROMIUM=/path/to/chrome npm run test:e2e
```

## Adding a test

Prefer role- and label-based locators (`getByRole`, `getByLabel`) over CSS
classes — they survive restyling and they double as an accessibility check.

Two gotchas this suite has already hit:

- `getByText('Route Found')` matches **substrings, case-insensitively**, so it
  also matches the error copy "No **route found** between…". Use
  `{ exact: true }` when the two could be confused.
- Both room pickers on the Route Finder render their own "Floor 1/2/3" tabs, so
  `getByRole('button', { name: 'Floor 3' })` is ambiguous — index it.
