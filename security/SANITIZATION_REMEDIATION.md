# Sanitization Remediation — do this before resuming Cowork security work

**Date:** 2026-06-28 · **Owner action required** · You run every step (these are your secrets — Cowork won't touch their values)

## Why
The Cowork security prompt requires a *sanitized* workspace: no secrets, no PII, no raw DB,
no live source. The folder currently mounted is the **live project** and still has secret/PII
files physically on disk. Git is fine — nothing sensitive is committed and `.gitignore` covers
it all — so this is purely about removing the files from the folder Cowork can read.

## What's safe right now (no action needed)
- `.gitignore` correctly ignores every secret/DB/backup file (verified via `git check-ignore`).
- No secret was ever committed (`backend/.env`, `.env.save`, `nexus.db`, the `.rtf`, `GMAIL.pdf`
  all show **0 commits** in history). So **no git history scrubbing is required.**

## On-disk files to deal with (the actual risk)

| File | What it is | Action |
|---|---|---|
| `IA NEXUS API KEY.rtf` | API key document | Move to password manager → delete from folder → **rotate if ever shared** |
| `GMAIL.pdf` | Gmail app-password / SMTP doc | Move to password manager → delete → **rotate app password if ever shared** |
| `backend/.env.save` | Backup copy of live secrets | Delete (the real `.env` is the source of truth) |
| `backend/.env` | Live secrets the app needs | Keep for local dev, but **do not mount this folder in Cowork** |
| `backend/nexus.db` (+ `-wal`, `-shm`) | SQLite DB w/ user rows (emails + bcrypt hashes) | Don't relocate; just exclude from any Cowork mount |
| `backend/nexus.db.phase2c-backup` | DB backup w/ user rows | Delete once confident in Phase 2C changes (SEC-004) |
| `frontend/src.phase1-backup`, `src.phase2-start-backup`, `backend/*.phase2c-backup` | Old code restore points | Not secret — delete to declutter when ready |

## Step 1 — Relocate the two secret documents (manual)
1. Open `IA NEXUS API KEY.rtf` and `GMAIL.pdf`, save their contents into your password manager
   (1Password / Bitwarden / Apple Passwords).
2. Delete both from the project folder.

## Step 2 — Remove on-disk secret/data leftovers
Run in Terminal (paste exactly — adjust if your project path differs):
```bash
cd "/Users/jaganvenkatraman/Documents/School AI Navigation Project _JV"
rm -f "IA NEXUS API KEY.rtf" GMAIL.pdf
rm -f backend/.env.save
rm -f backend/nexus.db.phase2c-backup
# optional cleanup of old code restore-points (not secret):
# rm -rf frontend/src.phase1-backup frontend/src.phase2-start-backup
# rm -f backend/db.js.phase2c-backup backend/server.js.phase2c-backup
```
Keep `backend/.env` (the app needs it locally).

## Step 3 — Rotate anything that may have leaked
Rotate if the key/password was ever emailed, screenshotted, shared, or stored anywhere outside
your machine (cheap insurance — when unsure, rotate):
- **Anthropic API key** → console.anthropic.com → API Keys → create new, delete old, update `backend/.env`.
- **Gmail app password** → myaccount.google.com → Security → App passwords → revoke & recreate, update `EMAIL_PASS` in `.env`.

## Step 4 — Set up a clean mount for future Cowork sessions
The prompt says Cowork should see **only** a sanitized security workspace, not the live repo.
Easiest option that fits the prompt:
- Create a separate folder, e.g. `~/Documents/IA-Nexus-Security/`, and copy in **only** the
  `security/` docs (PROFILE, CHECKPOINT, CONTROL_REGISTER, FINDINGS, RELEASE_READINESS,
  OWNER_CHECKLIST, the `cowork/` handoff files) — **no** `backend/`, `frontend/`, `node_modules/`,
  `.env`, `.db`, `.git`, `render.yaml`.
- Mount **that** folder in Cowork next time. Keep the live repo for Claude Code only.

## Step 5 — Verify, then resume
After Steps 1–2, confirm nothing sensitive remains in the mounted folder:
```bash
cd "/Users/jaganvenkatraman/Documents/School AI Navigation Project _JV"
ls "IA NEXUS API KEY.rtf" GMAIL.pdf backend/.env.save backend/nexus.db.phase2c-backup 2>/dev/null \
  && echo "STILL PRESENT — not done" || echo "clean: secret docs + backups removed"
```
When that prints `clean`, the SEC-001/002/003/004 residual owner actions are closed and the
Cowork engagement can resume.

---
*Closes residual owner actions on findings SEC-001, SEC-002, SEC-003, SEC-004.*
