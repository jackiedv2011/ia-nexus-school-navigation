# Owner Checklist — the 6 things only you can do

These can't be done in code (they live in your provider accounts or need your authority).
Rough time: ~30–40 minutes for #1–#4; #5 and #6 are conversations to start, not click-tasks.

---

## 1. Anthropic — set a spending cap + alert  (~5 min)  ⟶ caps your AI bill
1. Go to **console.anthropic.com** → **Settings** → **Limits** (or **Billing**).
2. Set a **monthly spend limit** you're comfortable with (e.g. $20–$50 to start).
3. Turn on a **usage/spend email alert** (e.g. at 50% and 90%).
- Why: the per-user rate limit I added bounds *how fast* one account can call the AI; this bounds
  *total* monthly spend as a hard backstop.

## 2. Move the secret files out of the repo + rotate if needed  (~10 min)  ⟶ stops leaks
1. Move these **out of the project folder** into a password manager (1Password, Bitwarden, etc.),
   then delete them from disk:
   - `IA NEXUS API KEY.rtf`
   - `GMAIL.pdf`
   - `backend/.env.save`
2. Make sure your real secrets live **only** in `backend/.env` (already gitignored).
   Use `backend/.env.example` as the template for what goes there.
3. **Rotate** any secret that was ever emailed, shared, screenshotted, or committed somewhere:
   - Anthropic key → console.anthropic.com → **API Keys** → create new, delete old, update `.env`.
   - Gmail app password → myaccount.google.com → **Security** → **App passwords** → revoke & recreate.
   - If unsure whether something leaked, rotating is cheap insurance.

## 3. Turn on MFA everywhere  (~10 min)  ⟶ protects the accounts that run IA Nexus
Enable two-factor / passkeys on each:
- **GitHub** (github.com → Settings → Password and authentication)
- **Anthropic** (console → Settings → security)
- **Render** (dashboard → Account Settings → 2FA)
- **Gmail** (the account behind EMAIL_USER — myaccount.google.com → Security → 2-Step Verification)
- Why: if any of these accounts is phished, an attacker controls your app, your AI billing, or your
  reset emails. MFA is the single biggest protection for a solo founder.

## 4. Database backups on Render  (~10 min, before real users)  ⟶ don't lose student data
The SQLite DB is a file on Render's persistent disk (`DB_PATH`). Pick one:
- **Simple:** a scheduled job/cron that copies `nexus.db` to object storage (e.g. a daily upload),
  **or** use Render's disk snapshot feature if available on your plan.
- **Test the restore** at least once: copy a backup to a fresh location, point a test instance at it,
  confirm logins/schedules load. A backup you've never restored isn't a backup.
- Note `nexus.db-wal` / `nexus.db-shm` exist now (WAL mode) — back up the DB while the app is briefly
  stopped, or use SQLite's online backup, so you capture a consistent copy.

## 5. FERPA / student-data posture  (start the conversation)  ⟶ legal, not code
- Your users are minors. Before a real launch, talk to an **Innovation Academy administrator** about
  whether the school needs to approve or sponsor this, and what student-data rules apply (FERPA in the US).
- Write a short **privacy note** (what you collect: email, name, chat, schedule; that it's deletable).
  `SECURITY.md` has a starting point — set a real monitored **security contact** address there.

## 6. Independent security review  (before substantial scale)  ⟶ a second set of eyes
- An AI review (this one) is **not** a substitute for an independent human pen-test.
- Options: a trusted CS teacher/mentor, a student security club, or a paid pen-tester before you hold
  a lot of real student data. Point them at `security/RELEASE_READINESS.md` and the authorization +
  rate-limit areas first.

---

### When #1–#4 are done
You move from **"synthetic/staging only"** to **"limited supervised beta is reasonable."**
Full ~500-user production also wants #5 and #6. See `security/RELEASE_READINESS.md`.
