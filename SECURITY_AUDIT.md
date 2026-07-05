# IA Nexus — Adversarial Security Audit

**Scope:** Full-stack review of the IA Nexus school-navigation app (Express + `node:sqlite` backend, React/Vite SPA frontend).
**Date:** 2026-07-03
**Reviewer:** Principal AppSec (adversarial audit)
**Status:** Phase 1–3 complete (recon + findings). Phase 4 (remediation) awaiting your review.

---

## 0. Executive summary

This codebase has already been through at least one hardening pass (pervasive `SEC-xxx` / `H1` / `M1` comments, a security regression test suite, a CI secret-scan + audit gate). That work is real and holds up: **no SQL injection, no command/eval/fs sinks, no IDOR, no XSS that I could prove exploitable, no secrets in git history, and `npm audit` is clean on both packages.**

There are **no Critical and no clearly-exploitable High findings.** The remaining risk is concentrated in **identity/abuse-resistance and token hygiene**: tokens live in `localStorage` with no server-side revocation, accounts are enumerable, and account creation is unauthenticated + uncapped in a way that feeds a paid LLM endpoint. These are the items worth fixing before this is trusted with a real school roster.

| # | Finding | Severity |
|---|---------|----------|
| H1 | Session tokens in `localStorage` + no server-side revocation (password change / logout / delete) | **High** |
| H2 | Unauthenticated, unverified, weakly-capped account creation → paid-LLM cost abuse | **High** |
| M1 | Account enumeration (signup `409` + login timing side-channel) | **Medium** |
| M2 | Teacher PII (names + period-by-period location) exposed to any self-registered account | **Medium** |
| M3 | Weak password policy (6 chars, no breach/complexity check) | **Medium** |
| L1 | Stray secret file `backend/.env.save` with plaintext Gmail app password on disk | **Low** |
| L2 | Display name not stripped of `<>` (inconsistent with schedule sanitizer) | **Low** |
| L3 | In-memory rate-limit/lockout state resets on restart & doesn't span instances | **Low** |
| L4 | No per-IP rate limit on authenticated data endpoints (`/route`, `/schedule`, `/teachers`) | **Low** |
| L5 | Prompt injection into the Claude system prompt | **Low** |
| L6 | Account/email squatting (register any email, no ownership proof) | **Low** |

---

## 1. Attack surface map

### Entry points (all API routes in `backend/server.js`)

| Method + Route | Auth | Rate limit | Sink |
|---|---|---|---|
| `POST /api/auth/signup` | none | `ipRateLimit` | DB insert |
| `POST /api/auth/login` | none | `ipRateLimit` + per-email lockout | DB read, bcrypt, JWT sign |
| `GET /api/auth/me` | Bearer | none | DB read |
| `POST /api/auth/profile` | Bearer | none | DB write (name) |
| `POST /api/auth/change-password` | Bearer | none | bcrypt, DB write |
| `DELETE /api/auth/account` | Bearer | none | cascade delete |
| `POST /api/auth/forgot-password` | none | `ipRateLimit` + per-email throttle | email send, DB write |
| `POST /api/auth/verify-code` | none | `ipRateLimit` + per-code attempts | bcrypt, JWT sign |
| `POST /api/auth/reset-password` | reset JWT | none | bcrypt, DB write |
| `GET/POST/PATCH/DELETE /api/chats[...]` | Bearer | none | DB read/write (ownership-checked) |
| `POST /api/chats/:id/messages` | Bearer | `perUserMessageLimit` | **Anthropic API (paid)**, DB write |
| `GET /api/teachers` | Bearer | none | static JSON |
| `GET/PUT /api/schedule` | Bearer | none | DB read/write |
| `POST /api/route` | Bearer | none | in-memory pathfinding |
| `GET *` (prod) | none | none | serves SPA `index.html` |

### Trust boundaries / data flow
- **Untrusted input** enters via JSON bodies (`express.json({ limit: '64kb' })`) and URL params (`:id`).
- **Sinks reached:** SQLite (100% parameterized prepared statements — `backend/db.js`, all `db.prepare(...).run/get/all`), Anthropic LLM (`chatbot-llm.js:154`), SMTP (`email.js:78`), HTML render (`MessageBubble.jsx:74`).
- **No** shell, `eval`, `child_process`, `fs` writes, or user-controlled outbound URLs anywhere → no RCE / SSRF / path-traversal surface.

### Auth/session model
- Identity: email+password → bcrypt (cost 10) → JWT `{id,email}` signed HS256, `expiresIn: '7d'` (`server.js:273`).
- Verified by `auth` middleware (`server.js:168`) reading `Authorization: Bearer`.
- Stored client-side in `localStorage['ia_token']` (`frontend/src/api/index.js:3`).
- **Auth uses a Bearer header, not a cookie → CSRF is not applicable** (good).
- Client route guard `ProtectedRoute` (`App.jsx:16`) is cosmetic; **the server enforces auth on every data route** (verified) — client-only gating is NOT a vulnerability here because the API is the real boundary.

### Third-party integrations
- Anthropic Claude (`claude-haiku-4-5`) — server-side only, fixed endpoint.
- Nodemailer → Gmail SMTP — fixed host, credentials from env.
- No OAuth / external identity providers / webhooks.

---

## 2. Findings (sorted by severity)

### H1 — Session tokens in `localStorage` with no server-side revocation
**Severity: High** (CVSS ~7.1 — depends on a companion XSS; impact is full account takeover with no kill-switch)
**Location:** `frontend/src/api/index.js:3-11`; token minted `backend/server.js:273`; `auth` `server.js:168-177`.

**Description.** The 7-day JWT is stored in `localStorage`, which is readable by any JavaScript in the origin. More importantly, the server has **no revocation mechanism**: there is no token version/`jti` blocklist, so:
- Changing the password (`server.js:290`) does **not** invalidate existing tokens.
- Deleting the account (`server.js:304`) does **not** invalidate the token — it still verifies for up to 7 days.
- There is no server-side logout.

**Exploit path.** (1) Any XSS or a shared/compromised browser yields the token from `localStorage`; the attacker then has 7 days of full access. (2) A user who believes they've "secured" their account by changing the password has not revoked a stolen token — the old token keeps working. (3) A user deletes their account; the attacker's copy of the token continues to authenticate against any endpoint that doesn't require a live DB row.

**Impact.** Persistent account takeover that survives the two actions a victim would take to stop it (password change, account deletion).

**Remediation.**
- Add a `token_version INTEGER DEFAULT 0` column to `users`; include `tv: user.token_version` in the JWT; in `auth`, reject if `payload.tv !== currentUser.token_version`. Bump `token_version` on password change and account deletion. This gives real revocation without a session store.
- Consider shortening access-token lifetime (e.g. 1h) with a refresh flow, or at minimum reduce `7d`.
- Prefer an `httpOnly; Secure; SameSite=Strict` cookie over `localStorage` if you can accept adding CSRF protection (double-submit token) — this removes the XSS-exfiltration path entirely. Given the current Bearer design, the `token_version` fix is the minimal high-value change.

---

### H2 — Unauthenticated, unverified account creation feeding a paid LLM endpoint (cost/abuse DoS)
**Severity: High** (CVSS ~7.0 — financial DoS + abuse of a paid third-party API)
**Location:** signup `server.js:237-251` (`ipRateLimit` only); message endpoint `server.js:442-472` (`perUserMessageLimit` = 20/min, 150/hr **per account**); LLM call `chatbot-llm.js:154`.

**Description.** Anyone can create accounts with no email verification. The only signup throttle is `ipRateLimit` (100 req/min/IP), and the message rate limit is **per-user**, not global. An attacker scripts account creation, then drives each account at 150 interactive messages/hour into the paid Anthropic API. From a single IP that is ~6,000 accounts/hour × 150 msgs = a very large, attacker-controlled bill; from a botnet it is unbounded.

**Exploit path.**
```
loop: POST /api/auth/signup {random email, pw}     # up to 100/min/IP
      POST /api/auth/login  -> token
      loop 150x: POST /api/chats/:id/messages {mode:"interactive", content:"..."}  # each = 1 paid Claude call
```
There is no global ceiling on interactive LLM calls and no proof-of-humanity on signup.

**Impact.** Runaway Anthropic spend; possible provider rate-limit exhaustion that degrades service for legitimate students.

**Remediation.**
- Gate signup behind email verification (you already have an email-code system for password reset — reuse it so an account isn't usable until the address is confirmed).
- Restrict signups to the school's email domain(s) (e.g. `@students.<district>.org`) if applicable.
- Add a **global** (not just per-user) budget/rate limit on `mode:"interactive"` LLM calls, and/or a daily per-account cap.
- Add a CAPTCHA / proof-of-work on signup, or an invite-code model.

---

### M1 — Account enumeration
**Severity: Medium** (CVSS ~5.3)
**Location:** signup `server.js:248` returns `409 "An account with this email already exists"`; login `server.js:262-271` runs `bcrypt.compare` only when the user exists.

**Description.** Two oracles reveal whether an email is registered:
1. **Signup 409** — distinct response for an existing address.
2. **Login timing** — `bcrypt.compare` (cost 10, ~tens of ms) executes only for existing users (`server.js:267`); a non-existent user returns immediately after the cheap `registerEmailFailure` call. The measurable latency delta discloses existence even though the message is generic.

Note: `forgot-password` is correctly generic (`server.js:317-320`), so this is inconsistent with the rest of the code's intent.

**Exploit path.** Submit a candidate list to `/api/auth/signup` and bucket by 409 vs 400/200; or measure `/api/auth/login` response time. Enumerated addresses feed targeted phishing / credential stuffing (see H2/M3).

**Impact.** Privacy disclosure of who has an account (students/staff); precursor to targeted attacks.

**Remediation.**
- Signup: return a generic "If this email can be registered, you'll receive a confirmation" and move to the email-verification flow (ties into H2). If you must fail fast, keep the message but understand it leaks — verification is the real fix.
- Login: perform a dummy `bcrypt.compare` against a fixed hash when the user doesn't exist, so timing is constant:
  ```js
  const DUMMY_HASH = '$2a$10$...'; // precomputed once
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  const hash = user ? user.password : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) { registerEmailFailure(normalizedEmail); return res.status(401)... }
  ```

---

### M2 — Teacher PII exposed to any self-registered account
**Severity: Medium** (CVSS ~5.0 — privacy/safety, by-design but under-protected)
**Location:** `GET /api/teachers` `server.js:476-478` (returns `data/teachers.json` wholesale); same data embedded in the LLM system prompt `chatbot-llm.js:30-43`.

**Description.** `teachers.json` contains real staff names and their **period-by-period room location** for the whole day. Any account — which anyone can create for free (H2) with no verification — can pull the entire staff location table. For a school context this is a real-person tracking dataset.

**Impact.** An outsider can determine exactly where any named staff member is at any time of day. Combined with H2 (no barrier to account creation), the data has effectively no access control beyond "have any token."

**Remediation.** This is partly a product decision, but at minimum: restrict accounts to verified school members (H2), and consider whether full-day location tables should be queryable in bulk vs. only on specific lookup. If the roster must stay behind a login, ensure that login actually means "verified member of this school."

---

### M3 — Weak password policy
**Severity: Medium** (CVSS ~4.8)
**Location:** signup `server.js:241`, change-password `server.js:293`, reset-password `server.js:369` — all enforce only `length < 6`.

**Description.** Six-character minimum, no complexity requirement, no check against known-breached passwords. Combined with enumeration (M1) and the per-account lockout being only 5 attempts / 15 min (`RATE.emailMax`), weak passwords remain guessable over time, and a school population will contain many trivial passwords.

**Remediation.** Raise minimum to ≥8 (NIST 800-63B), reject the top-N breached passwords (e.g. a bundled common-password list or `zxcvbn` strength scoring), and keep the existing lockout. Apply the same rule in all three places (extract a `validatePassword()` helper so they can't drift).

---

### L1 — Stray secret file `backend/.env.save` (plaintext Gmail app password)
**Severity: Low** (local hygiene — not committed, but a live secret at rest)
**Location:** `backend/.env.save` (present on disk; gitignored via `.env.*`, confirmed **not** tracked).

**Description.** `.env.save` contains a real `EMAIL_PASS` (Gmail app password) and `EMAIL_USER` in cleartext. It's correctly excluded from git, so this is not a repo leak — but it's an unnecessary second copy of a live credential sitting in the working tree, easy to accidentally `tar`, sync, or copy.

**Remediation.** Delete `backend/.env.save`. Since the value has now existed in a stray file, **rotate the Gmail app password** as a precaution. (I have not printed the value.)

---

### L2 — Display name not stripped of angle brackets (inconsistent sanitizer)
**Severity: Low** (defense-in-depth; not currently exploitable)
**Location:** signup `server.js:244` and profile `server.js:284` do `(name||'').trim().slice(0,60)` — no `<>`/control-char stripping, unlike the schedule teacher field which does (`server.js:514`).

**Description.** The display name is stored raw (minus length cap). It is **not** currently exploitable: React escapes text nodes, and the only raw-HTML sink (`MessageBubble.jsx:74`) runs `escapeHtml` before markdown expansion and never renders the name there. But the inconsistency means a future change that renders `name` unsafely would become stored XSS.

**Remediation.** Apply the same sanitizer used for `teacher`:
```js
const cleanName = String(req.body.name ?? '').replace(/[ -<>]/g, '').trim().slice(0, 60) || null;
```

---

### L3 — In-memory rate-limit / lockout state is volatile and per-instance
**Severity: Low**
**Location:** `ipAttempts`, `emailFails`, `msgMinute`, `msgHour`, `resetThrottle` Maps (`server.js:92-108`).

**Description.** All abuse counters live in process memory. A restart/redeploy resets every lockout and throttle (an attacker can force/await a restart to clear a login lockout), and the limits don't hold across horizontally-scaled instances. Current deploy is single-instance SQLite-on-disk, so impact is limited, but the login lockout (the main brute-force control) is defeated by any process restart.

**Remediation.** Back the security-relevant counters (per-email login failures, reset throttle) with the SQLite DB or a shared store (e.g. a `login_failures` table keyed by email with `count`/`reset_at`). Keep the cheap per-request IP counter in memory if you like.

---

### L4 — No per-IP rate limit on authenticated data endpoints
**Severity: Low**
**Location:** `/api/route` (`server.js:530`), `/api/schedule` GET/PUT (`484`,`500`), `/api/teachers` (`476`), chat list/CRUD — none use `ipRateLimit` or a per-user cap (only the message endpoint is capped).

**Description.** A single authenticated user can hammer pathfinding / schedule / teacher endpoints without limit. No paid dependency is involved, so this is cheap-to-serve, but it's an unbounded-work surface per token.

**Remediation.** Apply `ipRateLimit` (or a modest per-user counter reusing `bumpCounter`) globally to authenticated routes as a blanket ceiling.

---

### L5 — Prompt injection into the Claude system prompt
**Severity: Low**
**Location:** `chatbot-llm.js:152-159` — user message passed directly as the `user` turn alongside a system prompt containing all teacher data.

**Description.** A user can instruct the model to ignore its rules / reformat / reveal the full teacher table. Because (a) no tools/functions are exposed to the model, (b) it has no access to other users' data, and (c) the teacher data it might "leak" is already retrievable via `GET /api/teachers`, the blast radius is essentially "make the bot misbehave for yourself." Output is also rendered safely (escaped) so injected markup can't XSS.

**Remediation.** Low priority. If desired, wrap user input with clear delimiters and a reminder in the system prompt that everything after the delimiter is untrusted, and keep the (already-safe) output escaping.

---

### L6 — Account / email squatting
**Severity: Low**
**Location:** signup `server.js:237-251` — no proof of email ownership.

**Description.** An attacker can register a victim's email address before they do (denying them signup, since the address is then "taken" — and revealing existence, M1). No ownership is proven at creation.

**Remediation.** Resolved by the email-verification requirement in H2 (an unverified squat never becomes a usable/blocking account, or you key "taken" on verified accounts only).

---

## 3. Things checked and found SOLID (so you know the coverage)

- **SQL injection:** none. Every query is a parameterized prepared statement (`db.prepare(...).run/get/all(?)`); no string interpolation into SQL. The `${...}` hits in §1's grep are all in log strings, error messages, and JWT `expiresIn`, not SQL.
- **IDOR / BOLA:** every chat/message/schedule query is scoped by `user_id = ?` or an ownership pre-check (`server.js:408,426,436,443`). Changing `:id` to another user's chat returns 404.
- **XSS:** the one `dangerouslySetInnerHTML` (`MessageBubble.jsx:74`) is fed through `escapeHtml` **before** markdown expansion, and the expansion only emits fixed tags with no attributes → no injection. Assistant-only path; user messages render as React text. CSP `scriptSrc 'self'` (no `unsafe-inline`) is defense-in-depth on top.
- **Secrets in git:** none. History contains only `.env.example` placeholders (`sk-ant-xxxxxx`, `replace-with-a-long-random-string`). `.env`/`.db` are gitignored and untracked. CI runs Gitleaks + `npm audit --audit-level=high`.
- **Dependencies:** `npm audit` = 0 vulnerabilities (backend and frontend).
- **Security headers:** `helmet` v8 with an explicit CSP; HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy on by default.
- **CSRF:** not applicable — Bearer-header auth, no cookie session.
- **CORS:** not set in production (same-origin SPA) → browsers block cross-origin reads by default. Dev CORS is scoped to localhost. Correct.
- **JWT:** HS256 verified with `jwt.verify` (no `alg:none`/confusion path), boot refuses to start in production without `JWT_SECRET` (`server.js:28-35`).
- **Password reset:** codes bcrypt-hashed, 6-digit, 10-min TTL, 5-attempt cap, single-use, generic responses, per-email send throttle. Solid.
- **Mass assignment:** request bodies are explicitly destructured; no role/privilege field exists to over-post into. Schedule input is server-side re-sanitized (`server.js:508-519`) regardless of client.
- **Request size:** `express.json({ limit: '64kb' })` bounds body-based DoS.
- **AI call timeout:** `withTimeout(..., 25s)` prevents a hung provider from pinning a request.

---

## 4. Prioritized remediation plan

**P0 — do first (identity & money)**
- **H1:** add `token_version` revocation; bump on password-change and account-delete; reduce token lifetime.
- **H2:** require email verification for signup (reuse the code system) + global cap/budget on interactive LLM calls; restrict to school domain if applicable.

**P1 — high-value, low-risk**
- **M1:** constant-time login (dummy bcrypt) + generic signup response.
- **M3:** shared `validatePassword()` — min 8, breached-password/`zxcvbn` check, applied in all 3 places.
- **L1:** delete `backend/.env.save` and rotate the Gmail app password.

**P2 — hardening**
- **M2:** ensure "logged in" means "verified school member" (rides on H2); reconsider bulk roster exposure.
- **L3:** persist login-failure / reset throttles in SQLite so restarts don't clear lockouts.
- **L2:** strip `<>`/control chars from display name (match the teacher sanitizer).

**P3 — nice to have**
- **L4:** blanket per-IP/per-user ceiling on authenticated routes.
- **L5:** delimit untrusted user input in the LLM prompt.
- **L6:** resolved by H2.

---

---

## 5. Phase 4 — remediation status (implemented)

All findings addressed. Full test suite (22 tests, incl. route + chatbot regression snapshots) passes; frontend builds clean; server boots with migrations applied.

| # | Status | What changed |
|---|--------|--------------|
| **H1** | ✅ Fixed | Added `users.token_version` (migration, `db.js`). JWTs now carry `tv`; `auth` rejects any token whose `tv` ≠ the account's current version, and a token for a deleted account no longer resolves. Version is bumped on **change-password** and **reset-password** → all old sessions revoked. Change-password mints & returns a fresh token so the acting tab stays signed in (`server.js`, `SettingsModal.jsx`). |
| **H2** | ⚠️ Partial | Added a **global** budget on paid interactive LLM calls (`GLOBAL_AI` 60/min, 1000/hr) — caps total spend regardless of account count. Added optional `ALLOWED_EMAIL_DOMAINS` signup allowlist (off by default). **Deferred:** mandatory email-verification-before-use (needs a new frontend flow + would lock out existing users) — see "Remaining" below. |
| **M1** | ✅ Fixed | Login now runs `bcrypt.compare` against a fixed `DUMMY_BCRYPT_HASH` when the account doesn't exist → constant-time, no timing oracle. |
| **M2** | ⚠️ Mitigated | Gated by the `ALLOWED_EMAIL_DOMAINS` allowlist + H2 global cap. Full closure depends on H2 email verification (product decision). |
| **M3** | ✅ Fixed | Central `validatePassword()` (min 8 + common-password blocklist) applied in signup, change-password, reset-password; frontend copy updated 6→8. |
| **L1** | ✅ Fixed | Deleted `backend/.env.save`. **Action for you: rotate the Gmail app password** (it existed in that stray file). |
| **L2** | ✅ Fixed | Display name stripped of control chars + `<>` in signup and profile (matches schedule sanitizer). |
| **L3** | ✅ Fixed | Login lockout moved from an in-memory Map to the persisted `login_throttle` table → survives restart/redeploy. |
| **L4** | ✅ Fixed | `perUserRouteLimit` (240/min/user) applied to `/route`, `/schedule` GET+PUT, `/teachers`. |
| **L5** | ✅ Fixed | User input wrapped in `<student_message>` delimiters with an explicit untrusted-input instruction in the system prompt. |
| **L6** | ⚠️ Mitigated | Domain allowlist limits who can squat; full closure rides on H2 email verification. |

### Manual tests / actions for you
1. **Rotate the Gmail app password** (L1) — the old value sat in the deleted `.env.save`.
2. **Change-password UX** (H1): sign in on two devices/browsers, change the password on one — confirm the other is logged out on its next action while the acting tab keeps working.
3. **Password reset** (H1): after a reset, confirm any pre-existing session is rejected.
4. **(Optional) Domain lock** (H2/M2): set `ALLOWED_EMAIL_DOMAINS` in the environment and confirm off-domain signups get a 403.

### Remaining (needs your product decision — not code-safe to force)
- **H2 email verification / M2 / M6 full closure:** requiring a verified email before an account is usable is the real fix for cost-abuse, enumeration-via-signup, and squatting. It needs a new "verify your email" frontend step and a migration path for existing accounts, so I did **not** force it (it would break current signup→login and the test harness). The global LLM cap + domain allowlist reduce the exposure in the meantime. Say the word and I'll implement the verification flow as a follow-up.
- **Signup enumeration (M1, signup side):** the `409 "already exists"` response still discloses registration. It can only be hidden behind the email-verification flow above without harming UX; the login-side timing oracle (the subtler half) is fixed.
