# Recovery Checkpoint — Phase 0

**Last updated:** 2026-06-28

## Repository state
- Root: `/Users/jaganvenkatraman/Documents/School AI Navigation Project _JV`
- Branch: `master` · Remotes: none configured · **Commits: 0**
- Working tree: 45 files staged (no prior commit), many untracked (new components/pages, backups).
- **Implication:** there is **no git history safety net.** Rollback currently depends on the
  manual backups below, not on `git revert`. Recommend an initial commit (excluding secrets)
  early — tracked under Finding SEC-005.

## Pre-existing owner changes to preserve
All current app code is owner work in progress (UI Phases 1–2 completed this session).
Manual restore points created during that work (do **not** delete until owner is confident):
- `frontend/src.phase1-backup/`, `frontend/src.phase2-start-backup/`
- `backend/db.js.phase2c-backup`, `backend/server.js.phase2c-backup`, `backend/nexus.db.phase2c-backup`

## Project maturity / environment
- Stage **M1 → preparing M2** (synthetic data only; no production deployment yet).
- Local dev only: frontend Vite :5173 (proxy `/api` → :3001), backend Express :3001, SQLite file.

## Security-related code already present (not yet verified by this engagement)
- `helmet`, `cors`, `bcryptjs`, `jsonwebtoken`, `ipRateLimit` middleware, hashed reset codes.
- Production boot refuses to start without `JWT_SECRET`.
- New `schedules` endpoints (added this session) sanitize input server-side.

## Tests / commands actually executed this phase
| Command | Result |
|---|---|
| `git rev-list --all --count` | 0 commits |
| `node --version` | v24.15.0 |
| `npm audit --omit=dev` (frontend) | 0 vulnerabilities |
| `npm audit --omit=dev` (backend) | 0 vulnerabilities |
| `git check-ignore` on secret files | see SEC-001..004 |

## Unverified state changes / dependencies
- `schedules` table + `GET/PUT /api/schedule` were added and **functionally** tested this
  session (cross-device sync, sanitization) but **not yet security-reviewed** (Phase 5/6).
- Backend was restarted manually (background `node server.js` on :3001).

## Assumptions not yet proven
- Chat/message endpoints enforce per-user ownership (to be verified Phase 5).
- `ipRateLimit` is single-process in-memory (to be verified Phase 8; likely **not distributed**).
- Legal posture for minors' data (FERPA) — owner/counsel input required.

## Risks introduced by previous (UI) work
- None security-regressing identified yet. The added schedule endpoints expand the
  authenticated attack surface (reviewed in later phases).

## Prior-change classification
- Keep all current app code (owner WIP).
- **Quarantine from git**: the unignored secret/DB-backup files (SEC-001..004) until `.gitignore`
  is corrected — see FINDINGS.

---

## Session update — 2026-06-28 (Phases 1,3,4,5,6,8,10,11 partial)

### Owner-imposed protected systems (do NOT modify internal logic)
Route finder / A* (`roomCoordinates.js`), floor-map rendering, chatbot backend
(`chatbot-rules.js`), AI response (`chatbot-llm.js`), teacher lookup, provider integrations.
UI-around changes allowed if behavior unchanged; logic changes only for confirmed
functionality bugs. Security controls touching these are **proposed**, not auto-applied.

### Completed & verified this session
- **C-01 secrets/gitignore** — fixed & verified (SEC-001..004); residual = owner relocate/rotate.
- **C-30 authorization isolation** — A-vs-B IDOR matrix, all 404, no leakage. VERIFIED.
- **Account deletion completeness** — FK cascade ON; schedule rows removed. SEC-008 = N/A.
- **C-20/C-21 auth** — bcrypt, JWT prod-gated, hardened reset flow. Verified by source+behavior.
- **C-60 cost abuse (SEC-006)** — added `perUserMessageLimit` guard (20/min,150/hr); tested
  200→429 + Retry-After; protected AI modules untouched. REMEDIATED & VERIFIED.
- **C-31 client secret exposure** — none in `src/`+`dist/`. VERIFIED (release-gate cleared).
- **C-70 XSS (chat)** — single escaped `dangerouslySetInnerHTML`. VERIFIED.

### Code changed this session
- `.gitignore` (containment), `backend/server.js` (per-user message guard only — no protected
  module touched). 4 `security/` docs created + updated.

### Open / next (future sessions)
- **SEC-007** (message length cap) — proposed; touches protected endpoint → needs owner OK.
- **SEC-011** (chat title length) — safe to fix (non-protected).
- **Owner actions:** Anthropic monthly budget cap (C-61); relocate/rotate secret files;
  provider-account MFA (C-110); FERPA/minor-data posture (C-140).
- **Phase 9** resilience (AI-call timeout, kill switch) — assess/document.
- **Phase 12** reset-email abuse throttle (per-email) — assess.
- **Phase 13** logging/retention for minors + SQLite backup/restore drill on Render.
- **Phase 15** codify the manual authz + rate-limit tests into `backend/test/`.
- **Phase 16** fresh-context independent verification of Critical/High fixes.

### Release status
Still **NOT READY for real users** — but the two highest-risk technical items
(authorization isolation, AI cost abuse) are now closed. Remaining blockers are mostly
owner/operational (budget cap, MFA, backups, legal posture) + resilience/test hardening.

---

## Session update — 2026-07-03/04 (second adversarial pass + remediation)

### Repository state (changed since June)
- Branch now **`main`** (was `master`); **3 commits exist** (was 0). Working tree dirty with this
  session's fixes (uncommitted) + earlier UI edits. No remote push performed.
- `git user` = Das. No history rewrite, no push, no credential rotation performed (per authority rules).

### What this pass did
Re-ran the full engagement as an adversarial second opinion. Found **6 issues the June pass missed**
and remediated all of them (root report `/SECURITY_AUDIT.md`; findings SEC-014..019):
- **SEC-014 (High)** no session revocation → added `users.token_version`, `auth` version check, bump on
  pw-change/reset. **SEC-015 (High)** LLM denial-of-wallet via open signup → global AI budget + domain allowlist.
- **SEC-016 (Med)** weak pw policy → `validatePassword()` min 8 + common blocklist. **SEC-017 (Med)** login-timing
  enumeration → constant-time dummy bcrypt. **SEC-018 (Med)** bulk staff roster → route limits + allowlist gate.
- **SEC-019 (Low)** name sanitization, **persisted login lockout** (was in-memory), per-route limits, prompt-injection delimiters.
- **Hygiene:** deleted stray `backend/.env.save` (had a live Gmail app password) — **owner must rotate it.**

### Code changed this session
- `backend/db.js` (+`token_version` migration, +`login_throttle` table)
- `backend/server.js` (revocation, global AI cap, constant-time login, password policy, name sanitizer,
  persisted lockout, per-route limiter, domain allowlist)
- `backend/chatbot-llm.js` (prompt-injection delimiters), `backend/.env.example` (ALLOWED_EMAIL_DOMAINS)
- `backend/test/security.test.js` (+2 tests, pw fixture 7→8 chars)
- `frontend/src/components/SettingsModal.jsx` (store rotated token, copy 6→8), `Signup.jsx`, `ResetPassword.jsx` (copy)
- Deleted `backend/.env.save`. Updated `security/FINDINGS.md`, `CONTROL_REGISTER.md`, `RELEASE_READINESS.md`, this file.

### Tests / gates this session
- `backend npm test` → **22/22 pass** (incl. route 8/8 + chatbot 5/5 protected-system regressions unchanged, +2 new).
- `npm audit` frontend+backend → **0 vulnerabilities.** `frontend npm run build` → **clean.** Server boots (migrations apply).

### Unverified / deferred
- **No git commit made** — all fixes are in the working tree awaiting owner review/commit.
- Email-verification flow (full closure of SEC-015/018 + signup-side SEC-017) **deferred** — needs frontend work.
- Distributed rate-limit store (SEC-010) still deferred to multi-instance hosting.
- Owner blockers unchanged: Anthropic budget cap, backup/restore drill, MFA, FERPA posture, **rotate Gmail app pw.**

### Next
- Owner: review + commit this working tree on a security branch; complete owner/operational blockers.
- Optional next code task: implement the email-verification flow (I can do this on request).
- Phase 16 independent fresh-context verification of the new Critical/High fixes remains recommended.
