# Project Profile — IA Nexus

**Last updated:** 2026-06-28 · **Author:** Security engagement (Phase 0)

## Purpose
IA Nexus is a school navigation assistant for Innovation Academy High School: real-time
teacher locations, floor-by-floor route finding, a live bell schedule, an AI/rule-based
chat assistant, and a per-student personal class schedule.

## Repository layout
- **Monorepo**, single git repo (branch `master`), **0 commits** (all work staged/untracked).
- `frontend/` — React 18 + Vite 8 SPA (React Router, CSS Modules, lucide-react).
- `backend/` — Node.js (v24.15) + Express API.
- `security/` — this engagement's artifacts.

## Application types
- Public marketing web (Landing/About/Pricing).
- Authenticated SPA (chat, route finder, schedule, teacher directory).
- JSON API backend.

## Maturity stage — **M1 (prototype, synthetic data only), preparing for M2/launch**
- No real users yet; all accounts so far were synthetic test accounts (created/deleted during dev).
- Owner intent: public launch for ~500 concurrent users at one school.
- **Required gate:** the M2 controls in this document must reach evidence-backed outcomes
  before real students are invited.

## Actors / roles
- Anonymous visitor.
- Authenticated user (student or staff) — **single role; no admin role implemented**.
- Founder/operator (Jagan) — runs hosting, email, AI provider accounts.

## ⚠️ Sensitive-population escalation
Users are **high-school students — predominantly minors.** Collecting their email,
name, chat history, and class schedule carries **FERPA / student-data and minor-privacy
weight** (owner-confirmed legal posture: *unverified — needs owner/counsel input*). Per the
master prompt, the presence of minors **escalates required engagement depth.**

## Critical workflows
1. Signup / login (JWT, bcrypt).
2. Password reset (emailed 6-digit code → reset token).
3. Chat (AI "interactive" via Anthropic; "rule" via local data) + persisted history.
4. Route finding (A* over floor-plan coordinates).
5. Personal schedule save/sync (cloud, per-account).

## Data categories
| Data | Sensitivity | Store |
|---|---|---|
| Email | PII (minor) | `users.email` |
| Password | bcrypt hash | `users.password` |
| Display name | PII (minor) | `users.name` |
| Chat messages | personal, possibly identifying | `messages.content` |
| Personal schedule | personal (room per period) | `schedules.data` (JSON) |
| Password reset codes | hashed, time-limited | `password_reset_codes` |

## Stateful systems
- **SQLite** (`node:sqlite` DatabaseSync), single file `backend/nexus.db` (gitignored).
  Tables: `users`, `chats`, `messages`, `password_reset_codes`, `schedules`.

## Providers / vendors
- **Anthropic** (Claude Haiku) — AI chat. Secret: `ANTHROPIC_API_KEY`.
- **SMTP email** (Gmail, per local artifact) — reset codes. Secret: `EMAIL_PASS`.
- **Render** (intended hosting; `render.yaml`, `DB_PATH` persistent disk) — **not yet deployed**.
- Auth signing secret: `JWT_SECRET`.

## Public write paths / expensive ops
- `POST /api/auth/signup`, `/login`, `/forgot-password` (rate-limited via `ipRateLimit`).
- `POST /api/chats/:id/messages` — **calls Anthropic in interactive mode (cost path).**
- `PUT /api/schedule`, `POST /api/route`, chat CRUD — all `auth`-gated.

## Prior security work / incidents
- **None.** No `security/` directory existed before this engagement. No known incidents.
- Backend already has some hardening: `helmet`, `bcryptjs`, JWT, `ipRateLimit` on auth,
  production refuses to boot without `JWT_SECRET`, hashed reset codes with attempt limits.

## Environment variables (names only — no values inspected)
`ANTHROPIC_API_KEY`, `JWT_SECRET`, `EMAIL_HOST/PORT/USER/PASS/FROM/FROM_NAME/REPLY_TO`,
`DB_PATH`, `NODE_ENV`, `PORT`.

## Baseline (Phase 0)
- `npm audit --omit=dev`: **0 vulnerabilities** (frontend + backend).
- Tests present: `backend/test/chatbot.test.js`, `backend/test/route.test.js`.
  **No auth/authorization/workflow tests yet** (gap for Phase 15).
- Frontend production build: passes (verified during prior UI work).
