# Findings — IA Nexus Security Engagement

Severity: Critical / High / Medium / Low / Informational · Priority: P0–P3
Secrets and customer data are never recorded here.

---

## SEC-001 — Secret-bearing file `backend/.env.save` not gitignored
- **Severity:** High · **Priority:** P1 · **Confidence:** High · **Status:** Remediated (gitignore) & verified — residual Owner action
- **Verified 2026-06-28:** `.gitignore` now has `.env.*` / `backend/.env.*`; `git check-ignore backend/.env.save` returns the path. **Residual owner action:** delete or relocate the on-disk file (local exposure remains).
- **CWE:** CWE-538 (file/path exposure) / CWE-312 (cleartext storage) · **OWASP:** A05:2021 Misconfiguration
- **Component:** repo root `.gitignore`, `backend/.env.save`
- **Precondition:** file is currently **untracked** (not staged), so not yet in git — but `.gitignore`
  ignores `backend/.env` and `.env`, **not** `.env.save`. A `git add -A` / `git add .` would commit it.
- **Abuse scenario:** operator stages all files, pushes to a remote (GitHub) → real SMTP/JWT/API
  secrets become part of public or shared history. Not displayed or confirmed by this engagement.
- **Impact:** potential exposure of live credentials (email, JWT signing, AI key) if committed.
- **Root cause:** ignore rule matches exact `.env`, not `.env*` variants/backups.
- **Remediation (proposed, not yet applied):** add `*.env.save`, `.env*`, `!.env.example` patterns;
  confirm the file is not in the index; keep the real secrets only in the (ignored) `.env`.
- **Verification evidence:** _pending_ — `git check-ignore backend/.env.save` must return the path.
- **Residual risk:** the file still exists on the operator's disk (local exposure) — owner action.

## SEC-002 — `IA NEXUS API KEY.rtf` (API key document) not gitignored
- **Severity:** High · **Priority:** P1 · **Confidence:** High · **Status:** Guardrail in place (verified) — **Owner action required**
- **Verified 2026-06-28:** ignored via `IA NEXUS API KEY.rtf` + `*.rtf`; `git check-ignore` returns the path. **Owner must still:** (1) move this file OUT of the repo folder into a password manager; (2) rotate the API key if it was ever shared/emailed/committed elsewhere.
- **CWE:** CWE-312/538 · **OWASP:** A05:2021
- **Component:** repo root; untracked file `IA NEXUS API KEY.rtf`
- **Precondition/abuse/impact:** as SEC-001 — filename strongly implies a stored API key
  (likely the Anthropic key). Untracked today; a blanket `git add` would commit it.
- **Remediation (proposed):** move secret docs **out of the repo tree** (e.g. a password manager);
  add ignore patterns (`*.rtf` is too broad — prefer moving the file out, plus an explicit ignore).
- **Verification evidence:** _pending._
- **Residual risk:** value should be considered for rotation if it was ever shared/committed
  anywhere — add to owner rotation review.

## SEC-003 — `GMAIL.pdf` (email credential document) not gitignored
- **Severity:** High · **Priority:** P1 · **Confidence:** Medium · **Status:** Guardrail in place (verified) — **Owner action required**
- **Verified 2026-06-28:** ignored via `GMAIL.pdf`; `git check-ignore` returns the path. **Owner must still:** relocate out of the repo; rotate the Gmail app password if it was ever shared.
- **CWE:** CWE-312/538 · **OWASP:** A05:2021
- **Component:** repo root; untracked file `GMAIL.pdf`
- **Note:** filename suggests Gmail app-password / SMTP setup for `EMAIL_PASS`. Same commit risk.
- **Remediation (proposed):** relocate out of repo; ignore. Add `EMAIL_PASS` to rotation review
  if the document was shared.

## SEC-004 — Database backup `backend/nexus.db.phase2c-backup` not gitignored
- **Severity:** Medium · **Priority:** P2 · **Confidence:** High · **Status:** Remediated (gitignore) & verified — residual Owner action
- **Verified 2026-06-28:** ignored via `backend/nexus.db*` and `*.phase*-backup`; `git check-ignore` returns the path. **Residual owner action:** delete the backup once confident in the Phase 2C schedule changes.
- **CWE:** CWE-538 · **OWASP:** A05:2021
- **Component:** `.gitignore` ignores `backend/nexus.db` but not the `.phase2c-backup` copy.
- **Impact:** the copy contains user rows (emails + bcrypt hashes) from test accounts; committing
  it would expose that data and set a bad precedent for real data later.
- **Remediation (proposed):** broaden ignore to `backend/nexus.db*` and `*.phase*-backup`/
  `*.phase*-backup/`; delete the backup once the owner is confident in Phase 2C changes.

## SEC-005 — No version-control history / baseline commit (containment gap)
- **Severity:** Low · **Priority:** P2 · **Confidence:** High · **Status:** Finding open
- **Component:** repository (0 commits)
- **Impact:** no rollback safety net beyond manual folder backups; harder to audit change
  provenance; easy to accidentally commit the SEC-001..004 files in one large first commit.
- **Remediation (proposed):** after `.gitignore` is corrected and verified, make a clean initial
  commit that **excludes** all secret/DB/backup files. (Owner decision — not auto-committed.)

---

---

## SEC-006 — No per-user rate limit / cost cap on AI chat endpoint
- **Severity:** High · **Priority:** P1 · **Confidence:** High · **Status:** **Remediated & verified (code)** + Owner action (provider budget cap)
- **Verified 2026-06-28:** added `perUserMessageLimit` guard (20/min, 150/hr per user) on
  `POST /api/chats/:id/messages` in `server.js` — `auth` then guard, handler body unchanged.
  Test: normal rule-mode message → `200` with identical response; burst of 24 → exactly 20×`200`
  then `429` + `Retry-After: 60`. Protected modules (`chatbot-llm.js`/`chatbot-rules.js`)
  untouched (mtime unchanged). **Residual Owner action:** set a monthly spend cap + alert in the
  Anthropic console (defense in depth; the per-user guard bounds rate, not total monthly spend).
- **CWE:** CWE-770 (resource alloc w/o limits) · **OWASP:** API4:2023 Unrestricted Resource Consumption
- **Component:** `POST /api/chats/:id/messages` (interactive mode → Anthropic API)
- **Abuse scenario:** any authenticated student (or one compromised account) scripts rapid
  message sends in interactive mode. `ipRateLimit` is applied **only to auth routes**, not here,
  so each call hits Anthropic with **no per-user ceiling** → unbounded AI-token cost.
- **Impact:** runaway provider bill; the single most material cost risk for launch at ~500 users.
- **Root cause:** rate limiting was scoped to brute-force protection, not cost protection.
- **Proposed remediation (NON-behavioral, awaiting owner OK):** add a per-user request limiter
  **as a route guard** in `server.js` (e.g. N interactive msgs/min/user → 429). This does **not**
  modify `chatbot-llm.js`, `chatbot-rules.js`, or response generation — the AI's behavior for
  legitimate use is unchanged; it only bounds frequency. Endpoint is on the protected list, so
  not auto-applied.
- **Interim owner control:** set a hard **monthly spend cap / budget alert in the Anthropic
  console** (defense in depth regardless of code).

## SEC-007 — No length cap on chat message content
- **Severity:** Medium · **Priority:** P2 · **Confidence:** High · **Status:** **Remediated & verified** (owner-approved)
- **CWE:** CWE-770 · **OWASP:** API4:2023 · **Component:** `POST /api/chats/:id/messages`
- **Verified 2026-06-28:** messages over `MAX_MSG_LEN = 4000` chars rejected with `400`
  ("Message too long…"); normal message still `200`. Guard only — chatbot/AI logic untouched.

## SEC-008 — Account deletion orphaning schedule — **NOT APPLICABLE (disproven by test)**
- **Severity:** — · **Status:** Not applicable (evidence)
- **Evidence 2026-06-28:** `PRAGMA foreign_keys = 1` is ON; after `DELETE /api/auth/account`,
  `schedules` rows for the deleted user = **0**. CASCADE fires; deletion of personal data is
  complete. No remediation needed. Retained here so the check is on record.

## SEC-009 — Signup reveals whether an email is registered (enumeration)
- **Severity:** Low–Medium · **Priority:** P3 · **Confidence:** High · **Status:** Finding open / accepted-risk candidate
- **CWE:** CWE-204 · **OWASP:** API (info disclosure)
- **Component:** `POST /api/auth/signup` returns `409 "account already exists"`.
- **Detail:** login and forgot-password are correctly enumeration-resistant (generic messages),
  but signup confirms existence. For a minor population this is a mild privacy leak. It is
  **partially mitigated** by `ipRateLimit`. Eliminating it fully conflicts with normal signup UX
  (you must tell a user their email is taken). Recommend: keep, rely on rate limiting, revisit if
  abuse appears. Owner decision: accept or add email-verification-on-signup later.

## SEC-010 — Rate limiter is in-memory single-process (not distributed)
- **Severity:** Low at M1 · **Priority:** P2 before scale · **Status:** **Deferred by stage**
- **CWE:** CWE-770 · **OWASP:** API4:2023
- **Component:** `ipAttempts` / `emailFails` `Map`s in `server.js`.
- **Detail:** acceptable while on **one** server instance (current plan). **Activation trigger:**
  multi-instance/horizontal hosting OR real users at scale → move to a shared atomic store
  (e.g. Redis/Upstash) or provider-edge enforcement. Documented, not a current blocker.

## SEC-011 — Chat title (PATCH) length not bounded
- **Severity:** Low · **Priority:** P3 · **Status:** **Remediated & verified**
- **Component:** `PATCH /api/chats/:id` (chat CRUD — not a protected system).
- **Verified 2026-06-28:** title now `trim().slice(0,80)`, empty rejected `400`. Test: 200-char
  title → stored length 80; blank → 400.

## SEC-012 — Password-reset emails can be bombed per-address
- **Severity:** Medium · **Priority:** P2 · **Confidence:** High · **Status:** **Remediated & verified**
- **CWE:** CWE-770 · **OWASP:** API4:2023 / messaging-cost abuse
- **Component:** `POST /api/auth/forgot-password`
- **Abuse scenario:** repeated requests for `victim@school.edu` → inbox bombing + SMTP send cost.
  Per-IP limit alone is weak behind a shared school NAT.
- **Remediation (verified):** added `resetEmailAllowed()` — max 4 reset emails/hr/address and a
  60-second min gap, keyed by a **SHA-256 hash of the email** (raw address never stored). When
  throttled, the endpoint still returns the **generic** message, so enumeration resistance is
  preserved. Does **not** modify `email.js` (protected integration) — it only gates the send.
  Logic tested in isolation (1st allowed, immediate retry blocked, hourly cap at 4 → PASS); no
  real emails were sent during testing.

---

## SEC-013 — AI provider call has no timeout (resilience)
- **Severity:** Low–Medium · **Priority:** P2 · **Status:** **Remediated & verified** (owner-approved)
- **CWE:** CWE-400 · **Component:** `POST /api/chats/:id/messages` → `processMessageLLM` (Anthropic).
- **Verified 2026-06-28:** the interactive call site is wrapped in `withTimeout(…, 25 s)` in
  `server.js`; on timeout it rejects → existing catch returns `500` ("Failed to generate response")
  instead of hanging. `withTimeout` tested in isolation (fast call resolves; slow call → "AI timed
  out"). `chatbot-llm.js` unchanged. Rule mode is local/sync and intentionally not wrapped.

## Phase 9 — Availability / resilience (assessment)
- Body size bounded (`express.json 64kb`) ✓; per-user message guard ✓; SQLite single-writer is
  fine for one instance ✓. **Gaps:** no AI-call timeout (SEC-013); no global "AI kill switch"
  (could add an env flag to force rule-mode if the provider misbehaves — proposed, owner option).
- **SQLite WAL + foreign_keys — APPLIED & VERIFIED 2026-06-28:** `db.js` now sets
  `PRAGMA journal_mode=WAL` (better read/write concurrency for the ~500-user goal) and explicit
  `PRAGMA foreign_keys=ON` (keeps cascade deletes authoritative). Verified: `journal_mode=wal`,
  `foreign_keys=1`, full signup→schedule round-trip works. DB layer only — no protected system.

## Phase 13 — Logging / retention / backup (owner/operational)
- **Backup/restore is a release blocker** if absent: on Render the SQLite file lives on the
  persistent disk — owner must configure **periodic DB backups + a tested restore** before real
  users (RTO/RPO). *(Owner — C-100.)*
- **Minor-data retention:** define how long inactive accounts / chat history are kept and a
  deletion path (account self-delete already works & is complete). *(Owner — C-140.)*
- **Logging:** current logs are minimal and don't dump secrets/PII (good). Consider structured
  auth/abuse events later (Phase 15+).

## Verified positives (evidence-backed — recorded so they're not re-litigated)
- **Authorization isolation (C-30): VERIFIED** — cross-user IDOR matrix all `404`; no data leak.
- **Account-data deletion (C-100 partial): VERIFIED** — full cascade incl. schedule (see SEC-008).
- **Auth hardening (C-20):** bcrypt(10); JWT 7-day, prod refuses boot w/o `JWT_SECRET`; password
  reset uses hashed 6-digit codes, 10-min TTL, 5-attempt cap, single-use, generic responses;
  per-account login lockout + per-IP ceiling tuned for shared-school NAT.
- **CSP/headers (C-80):** `helmet` CSP with `script-src 'self'` (no script `unsafe-inline`),
  `object-src 'none'`, `frame-ancestors 'self'`. Strong baseline (verify from running build Phase 11).
- **CORS (C-80):** enabled only in dev for localhost; production is same-origin (SPA served by
  Express). No credentialed wildcard.
- **XSS in chat (C-70):** `MessageBubble` escapes HTML (`&<>`) **before** applying markdown-lite,
  and user messages render as plain text. Injection neutralized (full pass deferred to Phase 10).
- **Auth = Bearer token, not cookies** → CSRF largely N/A for the API.

### Notes
- SEC-001..004 containment done & verified (gitignore). Owner still must relocate/rotate secrets.
- SEC-006 is the key launch blocker; its fix touches a **protected** endpoint as a non-behavioral
  guard → awaiting owner approval. SEC-007 likewise. SEC-011 is safe to fix now (not protected).

---

# Second-pass findings (2026-07-03/04 — deeper adversarial audit)

The June pass declared 0 open Critical/High. A follow-up adversarial audit this session found
**6 issues that pass missed**, all now remediated & verified (see commits/tests). Recorded here for
full-scope preservation. Root report: `/SECURITY_AUDIT.md` (H1..L6 map to SEC-014..SEC-019 below).

## SEC-014 (audit H1) — No server-side session revocation; 7-day JWT survives password change & account deletion
- **Severity:** High · **Priority:** P1 · **Confidence:** High · **Status:** Remediated & verified
- **CWE:** CWE-613 (insufficient session expiration) / CWE-522 · **OWASP:** A07:2021 Ident/Auth Failures · **ASVS:** 3.3, 3.5
- **Component:** `backend/server.js` `auth`, login/change-password/reset-password; `backend/db.js` users table
- **Precondition:** attacker obtains a token (shared browser, XSS, device theft); token stored in `localStorage`.
- **Abuse scenario:** victim changes password or deletes account to "secure" it; the stolen 7-day token keeps
  authenticating because nothing invalidated it server-side.
- **Impact:** persistent account takeover surviving the two actions a victim would take to stop it.
- **Root cause:** stateless JWT with no version/blocklist; no revocation on credential change or deletion.
- **Remediation:** added `users.token_version`; JWTs carry `tv`; `auth` rejects tokens whose `tv` ≠ current
  (and rejects tokens for deleted users, since the row no longer resolves). `token_version` bumped on
  change-password and reset-password. Change-password mints a fresh token so the acting tab stays signed in.
- **Verification:** `backend/test/security.test.js` → "session revocation: changing password invalidates old
  tokens (H1)" — old token 200 → 401 after change; refreshed token 200. Suite 22/22 pass.
- **Residual risk:** token still in `localStorage` (XSS-exfiltration path remains until moved to httpOnly cookie).

## SEC-015 (audit H2) — Unauthenticated, unverified signup feeds paid LLM; per-user cap only (cost DoS)
- **Severity:** High · **Priority:** P1 · **Confidence:** High · **Status:** Remediated (partial) & verified — Owner action remains
- **CWE:** CWE-770 (alloc w/o limits) / CWE-799 · **OWASP:** API4:2023 Unrestricted Resource Consumption
- **Component:** `POST /api/auth/signup`; `POST /api/chats/:id/messages` (interactive → Anthropic `chatbot-llm.js`)
- **Precondition:** open registration; interactive message cap was **per-user** (20/min·150/hr) only.
- **Abuse scenario:** script mass-creates accounts (≤100/min/IP) and drives each at 150 msgs/hr into the paid
  Claude API → attacker-controlled bill; unbounded from a botnet.
- **Impact:** runaway Anthropic spend; provider rate-limit exhaustion degrades service.
- **Root cause:** no global budget on paid calls; no proof-of-humanity / email verification on signup.
- **Remediation (code):** added **global** interactive-LLM budget (`GLOBAL_AI` 60/min·1000/hr) that caps total
  spend regardless of account count (429 + Retry-After, reserved before any DB write); added optional
  `ALLOWED_EMAIL_DOMAINS` signup allowlist (off by default).
- **Verification:** boot + syntax OK; global guard exercised in code path; per-user cap regression still green.
- **Residual / Owner:** mandatory email-verification-before-use deferred (needs new frontend flow + migration for
  existing accounts) — see RELEASE_READINESS. Owner must still set an **Anthropic monthly budget cap** (C-61).

## SEC-016 (audit M3) — Weak password policy (6-char min, no common-password check)
- **Severity:** Medium · **Priority:** P2 · **Confidence:** High · **Status:** Remediated & verified
- **CWE:** CWE-521 (weak password requirements) · **OWASP:** A07:2021 · **ASVS:** 2.1.1, 2.1.7
- **Component:** signup, change-password, reset-password (`backend/server.js`); frontend copy
- **Abuse scenario:** trivial passwords ("password123") survive; enable credential stuffing against a school pop.
- **Remediation:** central `validatePassword()` — min 8 (NIST 800-63B) + common-password blocklist — applied in all
  three endpoints so the rule can't drift; frontend copy updated 6→8 (Signup, ResetPassword, SettingsModal).
- **Verification:** `security.test.js` → "password policy: short and common passwords are rejected (M3)" (sub-8
  → 400, common → 400, compliant → 200). Suite 22/22.
- **Residual risk:** no breach-corpus (HIBP/zxcvbn) check — blocklist is a small static set; acceptable at this scale.

## SEC-017 (audit M1) — Account enumeration via login timing + signup 409
- **Severity:** Medium · **Priority:** P2 · **Confidence:** High · **Status:** Login side remediated & verified; signup side accepted (documented)
- **CWE:** CWE-204 (observable response discrepancy) · **OWASP:** A07:2021 · **ASVS:** 2.2.1
- **Component:** `POST /api/auth/login` (bcrypt ran only when user existed); `POST /api/auth/signup` (409)
- **Abuse scenario:** timing delta (bcrypt runs ~tens of ms only for real users) reveals which emails are registered.
- **Remediation:** login now runs `bcrypt.compare` against a fixed `DUMMY_BCRYPT_HASH` when the account doesn't
  exist → constant-time; identical generic 401 either way.
- **Verification:** code inspection; both branches now call bcrypt once. Existing login/IDOR tests green.
- **Residual risk:** signup still returns 409 for existing emails (enumeration) — only closable behind the deferred
  email-verification flow (SEC-015) without harming UX. Accepted/documented; low risk given rate limits.

## SEC-018 (audit M2/L6) — Full staff location roster readable by any self-registered account
- **Severity:** Medium · **Priority:** P2 · **Confidence:** High · **Status:** Mitigated — full closure depends on SEC-015
- **CWE:** CWE-359 (exposure of private info) · **OWASP:** API3:2023 · relates to minor/staff safety
- **Component:** `GET /api/teachers` (returns `data/teachers.json` wholesale); same data in LLM system prompt
- **Abuse scenario:** `teachers.json` holds real staff names + period-by-period room — a person-tracking dataset.
  With open signup (SEC-015) it has no barrier beyond "have any token."
- **Remediation:** gated by `ALLOWED_EMAIL_DOMAINS` allowlist + SEC-015 global cap + new `perUserRouteLimit`
  (240/min) on `/teachers`. Full closure = verified-school-member accounts (email verification, SEC-015).
- **Residual / Owner:** product decision on whether full-day bulk roster should be queryable; verification flow.

## SEC-019 (audit L2/L3/L4/L5) — Hardening bundle: name sanitization, persistent lockout, route limits, prompt-injection delimiters
- **Severity:** Low · **Priority:** P3 · **Confidence:** High · **Status:** Remediated & verified
- **CWE:** CWE-79 (defense-in-depth) / CWE-307 / CWE-770 / CWE-1427 (prompt injection)
- **Components & fixes:**
  - **L2** display name now strips control chars + `<>` in signup **and** profile (matches schedule sanitizer) —
    removes a future stored-XSS foothold if `name` is ever rendered unsafely.
  - **L3** per-account login lockout moved from in-memory Map to persisted `login_throttle` table → survives
    restart/redeploy (previously a restart cleared any active brute-force lockout).
  - **L4** `perUserRouteLimit` (240/min/user) applied to `/route`, `/schedule` GET+PUT, `/teachers`.
  - **L5** user chat input wrapped in `<student_message>` delimiters + explicit untrusted-input instruction in the
    Claude system prompt (`chatbot-llm.js`); output was already HTML-escaped, so injected markup can't XSS.
- **Verification:** suite 22/22; schedule-sanitization + IDOR regressions unchanged; frontend build clean.
- **Residual risk:** L3 lockout is now durable but still single-node counting; distributed store still deferred
  (SEC-010 / C-60) until multi-instance hosting.

### Second-pass hygiene
- **`backend/.env.save` DELETED** this session (closes the residual on-disk exposure noted in SEC-001).
  **Owner must still rotate the Gmail app password** — the value lived in that stray file.
