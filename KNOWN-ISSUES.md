# Known issues

What the end-to-end audit found, ordered by severity. Entries marked
**FIXED** were addressed in a follow-up pass and are kept here for the record;
everything else is open, with why it wasn't fixed and what the fix would be.

Fixes are covered by `backend/test/audit.test.js`,
`backend/test/route-api.test.js`, `backend/test/data-consistency.test.js`, and
the frontend suite under `frontend/src/**/*.test.js`.

---

## MAJOR

### KI-1 — The admin dashboard does not exist

`backend/server.js` defines `adminAuth`, `adminRateLimit` and `pageParams`, and
`db.js` creates `admin_audit_log`. `frontend/src/api/index.js` exposes
`api.admin.stats/questions/flagged/feedback/auditLog/securityEvents`.
`.env.example` and `render.yaml` both document `ADMIN_KEY` as gating "/admin".

**None of it is wired to anything.** There is no `/api/admin/*` route in the
backend and no `/admin` route in `App.jsx`. Every `api.admin.*` call would 404
(and in production be swallowed by the SPA catch-all, returning `index.html`).
So the moderation data the app diligently collects — `analytics_log`,
`experience_feedback`, `security_events`, profanity flags — is currently
write-only and unreadable.

**Not fixed because** the choice between "build the dashboard" and "delete the
dead code and the `ADMIN_KEY` documentation" is a product decision, and the
first is a feature, not a bug fix.

**Recommended:** implement the six endpoints behind
`adminRateLimit, adminAuth` (all the pieces exist) plus a minimal `/admin`
page, or remove the dead code and drop `ADMIN_KEY` from `.env.example` and
`render.yaml` so nobody configures a control that does nothing.

### KI-2 — Chat directions and the map choose different stairwells on ~half of cross-floor trips

`ROOM_CLUSTERS` in `chatbot-rules.js` assigns **one stairwell per wing**,
regardless of destination. `findPath` picks the shortest stairwell for each
specific **pair** of rooms. Measured over all 2,970 cross-floor room pairs the
chatbot can answer: **1,411 agree, 1,559 differ.**

Both stairwells are real and walkable in every one of those cases — the audit
fixed the cases where the chat named a stairwell that *does not physically
exist* (see the commit), and `audit.test.js` now asserts that can't recur. What
remains is that the chat sometimes sends a student the longer way, and a
student who reads the directions and then opens the map sees two different
staircases for the same trip.

**Not fixed because** the fix is not "use `findPath`'s answer": every wing's
`exitSteps` and `arrivalFromStair` prose is hand-written **for a specific
stairwell**, so switching the stairwell without rewriting the prose produces
directions to the right staircase with the wrong turns — a worse bug. (Where a
substitution *is* forced today, the code deliberately falls back to generic
wording for exactly this reason.)

**Recommended:** either (a) fill in `arrivalFromStair` and a matching
`exitStepsFromStair` for every (wing, stairwell) pair, then always defer to
`findPath`; or (b) stop generating prose directions in the chat entirely and
have it render the map, which is already correct.

### KI-3 — Floor 2 has an orphaned corridor segment

`CORRIDORS[2].horizontal` contains `{ y: 826, xMin: 839, xMax: 907 }` — a 68px
hallway stub connected to nothing. Its nearest neighbours are 96px (the y=922
corridor) and 226px (the x=1133 corridor) away, far beyond `JUNCTION_TOL` (30),
so it forms its own two-node island in the floor-2 graph.

**Impact today: none.** No doorway projects onto it, so no route uses it. But
it is a live trap: the next room whose nearest corridor happens to be this stub
would attach to an unreachable island and become unroutable, with no error
anywhere except "no route" for that one room.

**Not fixed because** it needs someone with the school's plans to say whether
that hallway is real (and what it connects to) or a stray segment. Inventing a
connecting corridor would be inventing building geometry.

**Mitigated:** `audit.test.js` now asserts every doorway and stair landing is
mutually reachable, so if a future room *does* attach to this island the test
fails immediately instead of shipping.

**`NEEDS-HUMAN-REVIEW`** — please confirm with the floor plans, then either
extend the segment / add the connecting corridor, or delete the entry.

---

## MINOR

### KI-4 — `localStorage` accessed unguarded — **FIXED**

Every access now goes through `frontend/src/lib/storage.js`, which fails soft in
browsers where storage is unavailable (Safari private mode, "block all
cookies", some embedded webviews) or full. Covered by 18 tests in
`storage.test.js`. Login is the one place where a failed write is surfaced to
the user, because a session token that cannot be stored means they would be
silently signed out on the next navigation.

### KI-5 — Two moderate dependency advisories, both needing a major upgrade

- **backend:** `qs` (via `express@4` → `body-parser`) — GHSA-x5fp-wj9c-mxmx,
  GHSA-4mjr-xmp4-gh2g. `npm audit fix` reports a fix but cannot apply one:
  `body-parser@1.20.6` pins `qs@6.15.3` exactly. The real fix is **express 5**.
- **frontend:** `react-router` open redirect + `deserializeErrors` injection.
  Already on the newest 6.x (6.30.6); the fix is **react-router 7**.

Both are moderate and CI gates at `--audit-level=high`, so neither is currently
breaking the build. Both are breaking major upgrades that need their own change
and their own testing pass.

### KI-6 — Wheel-zoom fought page scroll — **FIXED**

`MapPanel` now registers a native `wheel` listener with `{ passive: false }`,
so `preventDefault()` actually takes effect. The zoom buttons also stop
`mousedown` propagation so clicking one at zoom > 1 no longer starts a pan drag.

### KI-7 — Footer legal links all point to `/about`

`Landing.jsx` links "Privacy Policy", "Terms of Use", "Data & Safety",
"Privacy" and "Terms" all to the single `/about` page. For an app that stores
student email addresses, class schedules and chat transcripts, these should be
real documents.

### KI-8 — No frontend test suite — **FIXED**

Vitest + jsdom + Testing Library, wired into CI. 80 tests covering the bell
schedule, the storage helper, the walking-time estimate and saved-route
parsing, the markdown/HTML escaping in chat messages, and the modal focus trap.

Still uncovered: the pages themselves as rendered components, and any
end-to-end journey. Playwright over the Route Finder and schedule flows is the
next step.

### KI-11 — Nothing tests the app as a running whole

Every fix in this audit was verified by unit test, by a production build, or by
driving the real express handlers over HTTP with the database stubbed. Nothing
exercises the browser: no page render tests, no click-through of a journey, no
check that the map actually draws.

**Recommended:** Playwright over the three journeys that matter — guest asks a
question, student finds a route, student sets a schedule and is routed to their
next class — including the failure paths (backend down, unroutable pair).

### KI-9 — `db.js` behaves differently under a non-`public` schema

`toPgSql` rewrites bare table names to qualify them with `DB_SCHEMA`, but only
when `DB_SCHEMA !== 'public'`. That regex has already caused one real bug (it
rewrote the string literal `'users'` inside a query, documented in `db.js`), and
it means the test suite exercises a *different* SQL path from production.

**Recommended:** qualify table names in the query text itself, or set
`search_path` per connection via the pool's `connect` event, so both
environments run identical SQL.

### KI-10 — `findPath` mutated the cached floor graphs — **FIXED**

Each query now runs against a copy-on-write overlay (`overlayGraph`), so the
three cached graphs are never written to. Verified: 1,029 routes leave
`FLOOR_GRAPHS` byte-identical. Cost is ~0.5 ms per route (same-floor 0.10 →
0.22 ms, cross-floor 0.92 → 1.38 ms), which is not close to mattering here.

## NIT

- `UPPER_FLOOR_ONLY_STAIRS` in `roomCoordinates.js` is redundant: the loop that
  uses it also checks `STAIR_POSITIONS[stairNum]?.[floor]` on the next line,
  which subsumes it. Harmless, but two mechanisms for one rule.
- `dijkstra()` re-sorts the whole frontier each iteration (`O(V² log V)`) and
  uses `queue.includes` (`O(V)`). At ~120 nodes per floor that measures
  **0.22 ms** same-floor and **1.38 ms** cross-floor. A binary heap would be
  correct-by-construction but not measurably faster, and would change
  tie-breaking between equal-cost paths — so it was left alone deliberately.
- `NavigationMap.jsx`'s draw effect depends on `points`, a fresh `path1 || []`
  array every render, so it re-runs on every render. It only resizes and
  redraws a small canvas, so this is cheap, but a `useMemo` in the parent (or
  keying on the path's length + endpoints) would remove the churn.
- The walking-time estimate rounds to whole minutes, so on shorter trips a
  floor change makes no visible difference to the number shown. That is
  inherent to a rounded estimate, not a bug — noted only so it isn't
  re-discovered as one.
- `frontend/src/pages/RoutePage.jsx` still keeps its own copy of the room list.
  It can no longer drift silently: `backend/test/data-consistency.test.js`
  parses the frontend file and fails if the two lists differ.
