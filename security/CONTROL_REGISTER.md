# Control Register — IA Nexus

Statuses: Not assessed · In assessment · Finding open · Proposed remediation · Remediated but
unverified · Verified · Blocked · Deferred by stage · Owner/Cowork action · Accepted risk · Not applicable

Lanes: Code · Cowork · Owner · External reviewer
Maturity: M1 → M2 gate. "Deferred by stage" items carry an activation trigger, not silent omission.

| ID | Area | Findings | Status | Evidence required | Next action | Lane |
|----|------|----------|--------|-------------------|-------------|------|
| C-00 | Phase 0 recovery & baseline | — | **Verified** | profile + checkpoint + baseline cmds | done | Code |
| C-01 | Secrets in repo / gitignore hygiene | SEC-001..004 | **Remediated (guardrail) & verified** | `git check-ignore` passes (done) | Owner: relocate secret docs out of repo | Code+Owner |
| C-02 | Secret rotation review (AI/email/JWT) | SEC-002,003 | Owner action | confirm whether values were shared/committed | rotate if exposed | Owner |
| C-03 | Version-control containment | SEC-005 | Finding open | clean initial commit excludes secrets | owner approves first commit | Owner |
| C-10 | Architecture & threat model | — | Not assessed | trust-boundary diagram, data flow | Phase 1 | Code |
| C-11 | Dependencies / supply chain | — | In assessment | `npm audit` clean (done); lifecycle review | Phase 3 | Code |
| C-12 | CI/CD guardrails | — | Not assessed | — | Phase 17 | Code+Owner |
| C-20 | Authentication (signup/login/reset/session) | SEC-009 | **Verified (code+behavior)** | bcrypt, JWT prod-gated, hardened reset | minor: signup enumeration (SEC-009) | Code |
| C-21 | JWT secret / token handling | — | **Verified** | prod `process.exit(1)` w/o `JWT_SECRET` confirmed in source | — | Code |
| C-30 | Authorization / IDOR (chats, messages, schedule) | — | **Verified (A-vs-B test)** | cross-user matrix all 404 | done | Code |
| C-31 | Privileged/machine-identity containment | — | **Verified** | no server secret in `src/`+`dist/` bundle | done (release-gate cleared) | Code |
| C-40 | API boundary validation (all routes) | SEC-007, SEC-011 | **Remediated & verified** | msg cap 4000 ✓; title cap 80 ✓ | done | Code |
| C-50 | Critical-workflow integrity / concurrency | — | **Verified (design)** | schedule PUT idempotent (upsert) ✓; reset single-use ✓; deletion cascade ✓ | concurrency stress later | Code |
| C-60 | Rate limiting / abuse / cost (AI + email) | SEC-006, SEC-010, SEC-012 | **Remediated & verified** | AI cap 20/min·150/hr→429 ✓; reset-email throttle ✓ | Owner: Anthropic budget cap; SEC-010 deferred | Code+Owner |
| C-61 | Availability / resilience / cost caps | SEC-006, SEC-013 | **Remediated & verified** (code) | AI-call timeout 25s ✓; WAL ✓ | Owner: set Anthropic spend cap | Code+Owner |
| C-70 | Browser: XSS/CSRF/CORS/SSRF/redirects | — | **Verified (chat surface)** | single escaped `dangerouslySetInnerHTML`; Bearer-auth (no CSRF) | SSRF N/A (no user-supplied URLs) | Code |
| C-80 | Transport / headers / cookies / deploy exposure | — | In assessment | helmet CSP strong in source | verify from running build | Phase 11 |
| C-90 | Email / webhooks / jobs | SEC-012 | **Remediated & verified** | per-address reset throttle (4/hr, 60s gap) ✓ | no webhooks present (N/A) | Code |
| C-100 | Logging / privacy / retention / backup | — | **Owner action (release blocker)** | periodic DB backup + tested restore on Render | configure backups before launch | Owner |
| C-110 | Operator/founder account security (MFA, registrar) | — | Owner action | Anthropic/Render/Gmail/GitHub MFA | Phase 14 | Owner |
| C-120 | Automated security tests | — | **Remediated & verified** | `backend/test/security.test.js` 7/7; suite 20/20 | done | Code |
| C-121 | CI/CD guardrails | — | **Implemented** | `.github/workflows/ci.yml` (tests+audit+build) | runs on push to GitHub | Code+Owner |
| C-130 | Independent verification | — | Owner/External action | fresh-context review of Crit/High | run as separate session + human pentest | External |
| C-140 | FERPA / minor-data legal posture | — | Owner action | owner/counsel confirmation | ongoing | Owner |

### Deferred-by-stage candidates (M1 → activate before M2/launch)
- C-60 distributed rate limiting: single-instance in-memory is acceptable **only** while on one
  server with no real users. **Trigger:** real users invited OR multi-instance hosting.
- C-130 external penetration test: recommended gate **before** holding real student data.
