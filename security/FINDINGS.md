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
