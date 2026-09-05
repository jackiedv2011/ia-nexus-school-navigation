# Known issues

Findings from the end-to-end audit of this repository.

**Open issues come first** — those are what a reader needs. Fixed ones follow,
kept as a record of what was wrong and why the fix is shaped the way it is.

Regression coverage for the fixes lives in `backend/test/audit.test.js`,
`route-api.test.js`, `admin-api.test.js`, `email-origin.test.js`,
`data-consistency.test.js`, the frontend unit suite under
`frontend/src/**/*.test.js`, and the browser suite under `frontend/e2e/`.

---

# OPEN

These are not fixed. Each says why, and what the fix would be.

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


### KI-7 — Footer legal links all point to `/about`

`Landing.jsx` links "Privacy Policy", "Terms of Use", "Data & Safety",
"Privacy" and "Terms" all to the single `/about` page. For an app that stores
student email addresses, class schedules and chat transcripts, these should be
real documents.

---

# FIXED

Kept for the record — what was wrong, and why each fix is shaped the way it is.

### KI-5 — Dependency advisories — **FIXED, 0 vulnerabilities**

`react-router-dom` 6.30.6 → 7.18.3 (open redirect, `deserializeErrors`
injection) and `express` 4 → 5 (`qs`, which express 4 pinned so `npm audit fix`
could not move it). `npm audit --omit=dev` now reports **0 vulnerabilities** on
both sides.

Express 5 was held back in the first pass for a stated reason, and that reason
turned out to be exactly right: it uses path-to-regexp v8, which **rejects the
bare `'*'`** this app used for its production SPA catch-all — the server refused
to boot. Now `'/{*splat}'`. That failure only appears in production mode, which
is why it was worth having the tooling before attempting it.

What made it safe to do was standing up a real Postgres, so the nine auth and
session tests that had never once executed could actually run. Verified:
95/95 backend tests with a database (in both the public and an isolated schema),
51 browser tests, every attack scenario re-run, production SPA deep links, and
the 1,500-request bell load.

### KI-9 — `db.js` behaved differently under a non-`public` schema — **FIXED**

`toPgSql` rewrote bare table names *anywhere* they appeared, including inside a
string literal — which had already shipped once as a real bug, mangling the
migration's `WHERE table_name = 'users'`. The rewrite is now anchored to the
keywords that actually precede a table name (`FROM`, `JOIN`, `INTO`, `UPDATE`,
`TABLE`, `REFERENCES`, `ON`), which makes that whole class of mistake
impossible rather than relying on nobody writing a table name in a string again.

Verified against a real Postgres: the full suite passes identically under the
`public` schema and under an isolated one, and `test/db-sql.test.js` pins down
every rewrite position plus the cases that must NOT be rewritten (string
literals, `ON CONFLICT DO UPDATE` column references, and columns like
`users_count` whose names contain a table name).

Also fixed here: `db.js` hardcoded `ssl: { rejectUnauthorized: false }`, so it
could only ever talk to Supabase — a local Postgres for development or testing
was impossible. TLS is now chosen from the URL.

### KI-12 — Host-header injection in emailed verification links — **FIXED**

`getFrontendOrigin` built the "verify your email" link from `req.get('host')`.
That header is set by the caller, not the server. An **unauthenticated** POST to
`/api/auth/signup` carrying `Host: evil.example` made this app send a real
email — from the school's own address, to any address the attacker typed —
containing a link to `evil.example` with a live token on it. Reproduced against
the running server before fixing (`fetch` cannot set `Host`; it takes a raw
socket, which is why `backend/test/email-origin.test.js` looks the way it does).

The origin is now resolved as: `FRONTEND_URL` → `RENDER_EXTERNAL_URL` (which
Render injects, so the normal deploy needs no configuration) → a request host
that appears in the new optional `ALLOWED_HOSTS` → nothing, in which case the
email is skipped rather than sent with a poisoned link. Seven tests cover it,
including a host that merely *prefixes* an allowed one.

Also fixed in passing: the development default pointed at `localhost:5173`,
which is the port this project deliberately does not use, so every dev
verification link led nowhere.

### KI-1 — The admin dashboard did not exist — **FIXED**

The scaffolding was all there (`adminAuth`, `adminRateLimit`, `pageParams`, the
`admin_audit_log` table, six `api.admin.*` client methods, `ADMIN_KEY`
documented in `.env.example` and `render.yaml`) with nothing wired to it, so
every moderation signal the app collected was write-only.

Now implemented: six read-only endpoints behind the existing
`adminRateLimit, adminAuth` chain, plus an `/admin` page that prompts for the
key. Read-only on purpose — a leaked key exposes information but cannot alter
or delete anything. Ten integration tests (`backend/test/admin-api.test.js`)
boot the real server with the database stubbed, so they run in CI without a
Postgres; they cover a same-length wrong key (the constant-time compare), an
unset `ADMIN_KEY` closing rather than opening the dashboard, audit-logging of
both allowed and rejected attempts, page-size clamping, and the absence of any
write verb.

### KI-2 — Chat directions disagreed with the map — **FIXED**

`ROOM_CLUSTERS` assigned one stairwell per wing regardless of destination,
while `findPath` picks the shortest for each specific pair. Measured across all
2,970 cross-floor room pairs the chatbot can answer: 1,411 agreed, **1,559
differed**.

Resolved by removing the second description of the building rather than trying
to keep two in sync. `buildNavigation` now calls `findPath` and reports what it
found — the floors, the wing names, the stairwell, the distance and the walking
time — and the app renders the real map underneath the message. The ~330 lines
of hand-written turn-by-turn prose in `ROOM_CLUSTERS` are gone; only the wing
*names* survive. The interactive (LLM) mode is instructed the same way: state
where the rooms are, never invent turns, the map is the directions.

`audit.test.js` now asserts the chat and the map name the same stairwell for
**every** room pair, and that the distance and time quoted in chat are the ones
the routed path actually measures.

### KI-13 — First paint blocked on a third-party stylesheet — **FIXED**

`index.html` loaded the Google Fonts stylesheet with a plain
`<link rel="stylesheet">`, which is render-blocking: if `fonts.googleapis.com`
was slow, filtered or unreachable, the page showed nothing until the browser
gave up on it. School networks filter CDNs more than most, and this app is for
one school. The end-to-end suite surfaced it — with that host unreachable, the
`load` event never fired and every navigation waited out a timeout.

The three families are now self-hosted under `frontend/public/fonts/` (latin and
latin-ext subsets only — 244 KB across six `.woff2` files), with the primary
Inter face preloaded. Verified in a browser: **zero off-origin requests**, and
all three families load and apply.

Because nothing is off-origin any more, the CSP tightened from

    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
    font-src  'self' https://fonts.gstatic.com
    img-src   'self' data: https://images.unsplash.com

to `'self'` (plus `data:` for images and `'unsafe-inline'` for the style
attributes React writes). The Unsplash allowance was already dead — nothing in
the app hotlinks an image.

The e2e fixture now **fails any test that makes an off-origin request**, so a
hotlinked asset creeping back in breaks the build rather than quietly
reintroducing the dependency. Proven to fail when one is added.

### KI-14 — 161px of horizontal overflow at 320px — **FIXED**

The Route Finder, My Schedule and Teacher Directory share a navbar with a
wordmark and four links, none of which wrapped or shrank. At 320px — the
narrowest phone width still in common use — the page scrolled sideways by
161px, measured by the end-to-end suite.

The links are now a horizontally scrollable strip below 640px (scrollbar
hidden; still reachable by swipe, and by keyboard since Tab scrolls focus into
view), with smaller padding, and the wordmark drops below 400px, leaving the
phoenix mark as the link home. The e2e suite asserts zero horizontal overflow
at 320, 768, 1024 and 1440px.

### KI-4 — `localStorage` accessed unguarded — **FIXED**

Every access now goes through `frontend/src/lib/storage.js`, which fails soft in
browsers where storage is unavailable (Safari private mode, "block all
cookies", some embedded webviews) or full. Covered by 18 tests in
`storage.test.js`. Login is the one place where a failed write is surfaced to
the user, because a session token that cannot be stored means they would be
silently signed out on the next navigation.

### KI-6 — Wheel-zoom fought page scroll — **FIXED**

`MapPanel` now registers a native `wheel` listener with `{ passive: false }`,
so `preventDefault()` actually takes effect. The zoom buttons also stop
`mousedown` propagation so clicking one at zoom > 1 no longer starts a pan drag.

### KI-10 — `findPath` mutated the cached floor graphs — **FIXED**

Each query now runs against a copy-on-write overlay (`overlayGraph`), so the
three cached graphs are never written to. Verified: 1,029 routes leave
`FLOOR_GRAPHS` byte-identical. Cost is ~0.5 ms per route (same-floor 0.10 →
0.22 ms, cross-floor 0.92 → 1.38 ms), which is not close to mattering here.

### KI-8 — No frontend test suite — **FIXED**

Vitest + jsdom + Testing Library, wired into CI. 80 tests covering the bell
schedule, the storage helper, the walking-time estimate and saved-route
parsing, the markdown/HTML escaping in chat messages, and the modal focus trap.

Still uncovered: the pages themselves as rendered components, and any
end-to-end journey. Playwright over the Route Finder and schedule flows is the
next step.

### KI-11 — Nothing tested the app as a running whole — **FIXED**

Playwright now drives a real Chromium against the real app (the actual backend
with only its database stubbed, behind the real Vite dev server), covering the
Route Finder end to end including its failure paths, guest chat with the inline
route map, the admin key gate, and routing/responsiveness across the public
pages. Wired into CI as its own job.

Still uncovered end-to-end: anything that needs real stored accounts — signup,
login, chat history, the personal schedule. Those are covered by
`backend/test/security.test.js` at the API level when a database is available,
but not through the browser.

---

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
