# Release Readiness — IA Nexus

**Assessment date:** 2026-06-28 · **Engagement:** High-Assurance Security Master Prompt v3.0
**Maturity:** M1 → preparing M2 · **Stack:** React/Vite SPA + Node/Express + SQLite, JWT/bcrypt,
Anthropic + SMTP, Render (intended). Versions per `package-lock.json`; `npm audit` clean.

## Assessed scope & exclusions
- **In scope:** auth, authorization/IDOR, API boundaries, AI-cost & email abuse, input validation,
  XSS/CSP/CORS, account-data deletion, DB integrity/concurrency, secrets hygiene, dependency posture,
  automated tests, CI.
- **Owner-protected (not modified):** A* pathfinding, floor-map rendering, chatbot/AI logic,
  teacher lookup, provider integrations. Security controls around them were added as non-behavioral
  guards only; their own regression tests still pass (route 8/8, chatbot 5/5).
- **Out of scope / external:** independent human penetration test; live provider-account config;
  legal/FERPA determination.

## Risk before → after
| Area | Before | After |
|---|---|---|
| Cross-user data access (IDOR) | unproven | **Verified isolated** (tests) |
| AI provider cost abuse | unbounded | **Capped** (20/min·150/hr/user + timeout) |
| Password-reset email bombing | per-IP only | **Per-address throttled** |
| Secret leakage via git | 3 files unignored | **Ignored + verified** (relocate = owner) |
| Client-exposed secrets | unproven | **None** (bundle scanned) |
| DB concurrency/integrity | default | **WAL + FK-on** |
| Input bounds (msg/title) | unbounded | **Capped + tested** |
| Regression safety | none | **20/20 test suite + CI** |

## Critical/High findings: before vs after
- Before: 1 High (SEC-006 AI cost) + 3 High (secret files) live.
- After: **0 open Critical/High code findings.** All remediated & verified.

## Conclusions by domain
- **AuthN/session:** bcrypt, JWT 7d, prod refuses boot w/o `JWT_SECRET`, hardened reset. ✔
- **AuthZ/isolation:** every user-scoped route enforces `user_id`; A-vs-B matrix 404. ✔
- **Critical workflow:** schedule upsert idempotent; reset single-use; deletion cascade complete. ✔
- **Rate limit/abuse/cost:** per-user AI cap + reset-email throttle (in-memory — see deferral). ✔ / ⚠
- **Resilience:** AI-call timeout, WAL, bounded body/inputs. ✔
- **Secrets/deps:** gitignore fixed; no client secret; `npm audit` clean. ✔ (rotation = owner)
- **Browser:** escaped single `dangerouslySetInnerHTML`; strong CSP; same-origin prod CORS. ✔

## Untested / residual risk
- AI-call timeout returns 500 (not a dedicated 503) — acceptable, non-hanging.
- Rate limiter is **in-memory single-process** (SEC-010): correct for one instance; **must** move to
  a shared store before multi-instance hosting.
- No load/concurrency stress test executed (Phase 9 fault matrix) — recommended pre-launch.
- Signup email enumeration (SEC-009) accepted as low risk, mitigated by rate limiting.

## Owner / external blockers (cannot be closed in code)
1. **Anthropic monthly budget cap + alert.**
2. **DB backup + tested restore on Render** (RTO/RPO).
3. **Relocate secret files out of repo; rotate if ever shared.**
4. **Strong MFA** on Anthropic / Render / Gmail / GitHub.
5. **FERPA / minor-data posture** confirmed with school/counsel.
6. **Independent human penetration test** before substantial real-student data.

## Readiness outcome

> ### Current: **Safe only for synthetic/staging testing.**
> The code surface is materially hardened (0 open Critical/High), but operational blockers (#1–#5)
> remain.
>
> ### Path to **Limited beta (with restrictions):** close owner items #1–#4 (budget cap, backup/restore,
> secret relocation/rotation, MFA). Then a small, supervised pilot is reasonable.
>
> ### Path to **full production at ~500 users:** additionally complete #5 (legal/FERPA) and #6
> (independent pentest), and migrate the rate limiter to a shared store if you move beyond one instance.

AI-assisted review is **not** equivalent to an independent professional penetration test.
