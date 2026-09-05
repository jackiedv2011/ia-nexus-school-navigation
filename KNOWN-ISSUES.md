# Known issues

Everything the end-to-end audit found and did **not** fix, with why, and what
the fix would be. Ordered by severity. Issues that were fixed are not listed
here — they are in the commit and covered by `backend/test/audit.test.js` and
`backend/test/route-api.test.js`.

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

### KI-4 — `localStorage` is accessed unguarded in several places

Fixed in the three places where a throw breaks something: `ThemeContext.jsx`
(outside the `ErrorBoundary` — a throw there is a blank white page),
`RoutePage.jsx`, and `SchedulePage.jsx`'s per-keystroke cache write.

Still unguarded: `api/index.js` (`getToken`, `handleExpiredSession`),
`ChatPage.jsx`, `Login.jsx`, `Landing.jsx`, `VerifyEmail.jsx`,
`Onboarding.jsx`, `ChatArea.jsx` (`sessionStorage`). In a browser with site
data blocked (Safari private mode, "block all cookies", some embedded
webviews), these throw and the affected page fails to render.

**Recommended:** a single `src/lib/storage.js` with `safeGet`/`safeSet`/
`safeRemove`, then replace every direct call. Held back here only to keep the
audit's diff reviewable — it touches nine files for no behaviour change in a
normal browser.

### KI-5 — Two moderate dependency advisories, both needing a major upgrade

- **backend:** `qs` (via `express@4` → `body-parser`) — GHSA-x5fp-wj9c-mxmx,
  GHSA-4mjr-xmp4-gh2g. `npm audit fix` reports a fix but cannot apply one:
  `body-parser@1.20.6` pins `qs@6.15.3` exactly. The real fix is **express 5**.
- **frontend:** `react-router` open redirect + `deserializeErrors` injection.
  Already on the newest 6.x (6.30.6); the fix is **react-router 7**.

Both are moderate and CI gates at `--audit-level=high`, so neither is currently
breaking the build. Both are breaking major upgrades that need their own change
and their own testing pass.

### KI-6 — Pinch-zoom on the floor-map panel fights page scroll

`MapPanel.jsx` calls `e.preventDefault()` in a React `onWheel` handler. React
attaches wheel listeners passively at the root, so the call is a no-op and logs
a console warning; the page scrolls behind the map while zooming.

**Recommended:** attach a native `wheel` listener with `{ passive: false }` in a
`useEffect` on `wrapRef`.

### KI-7 — Footer legal links all point to `/about`

`Landing.jsx` links "Privacy Policy", "Terms of Use", "Data & Safety",
"Privacy" and "Terms" all to the single `/about` page. For an app that stores
student email addresses, class schedules and chat transcripts, these should be
real documents.

### KI-8 — No frontend test suite

There is no test infrastructure for the React app at all — no runner, no
component tests, no end-to-end tests. Every frontend fix in this audit was
verified by tracing the code path and by a production build, not by a test.

**Recommended:** Vitest + Testing Library for the pure logic first
(`lib/schedule.js`, `RoutePage`'s `estimateWalk` / `readRouteList`,
`MessageBubble`'s `detectRoute` and `formatText`), then Playwright for the
Route Finder and schedule journeys.

### KI-9 — `db.js` behaves differently under a non-`public` schema

`toPgSql` rewrites bare table names to qualify them with `DB_SCHEMA`, but only
when `DB_SCHEMA !== 'public'`. That regex has already caused one real bug (it
rewrote the string literal `'users'` inside a query, documented in `db.js`), and
it means the test suite exercises a *different* SQL path from production.

**Recommended:** qualify table names in the query text itself, or set
`search_path` per connection via the pool's `connect` event, so both
environments run identical SQL.

### KI-10 — `addRoomTerminal` permanently mutates the cached floor graphs

Each `findPath` call adds `room:in:` / `room:out:` terminal nodes to the shared
cached graph and never removes them. They are keyed per room, so the growth is
bounded at roughly two nodes per room (~160 total) and correctness is unaffected
— the terminals are one-way and can never appear mid-path. But every subsequent
Dijkstra run initialises `dist` over them, and `FLOOR_GRAPHS` (a public export)
changes shape depending on what has been routed.

**Recommended:** build the terminals into a shallow per-call overlay rather than
the cached graph.

---

## NIT

- `UPPER_FLOOR_ONLY_STAIRS` in `roomCoordinates.js` is now redundant: the loop
  that uses it also checks `STAIR_POSITIONS[stairNum]?.[floor]` on the next
  line, which subsumes it. Harmless, but two mechanisms for one rule.
- `dijkstra()` re-sorts the whole frontier array each iteration
  (`O(V² log V)`) and uses `queue.includes` (`O(V)`). At ~120 nodes per floor
  this measures **0.10 ms** for a same-floor route and **0.92 ms** for a
  cross-floor one (which runs up to 10 Dijkstras). A real binary heap would be
  correct-by-construction but would not be measurably faster here.
- `frontend/src/pages/RoutePage.jsx` keeps its own copy of `ROOM_LABELS`. The
  two lists are currently identical, and nothing enforces that.
- `NavigationMap.jsx`'s draw effect depends on `points`, which is a fresh
  `path1 || []` array every render, so the effect re-runs on every render.
