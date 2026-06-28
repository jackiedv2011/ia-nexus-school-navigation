# Secure Development Guide — IA Nexus

How to keep IA Nexus secure as it grows. Tie every new feature back to the control register.

## Golden rules
1. **Never trust the client.** Derive identity, ownership, and any security-relevant value
   (price, role, schedule, state) from `req.user` / the database — never from request fields.
2. **Scope every query by `user_id`.** New user-data routes must filter
   `WHERE ... AND user_id = ?` and 404 on someone else's resource (see existing chat/schedule routes).
3. **Bound every input.** Length caps, type checks, allow-lists. Reject unknown fields.
4. **Guard expensive/abusable actions.** Anything that costs money (AI calls), sends email, or
   writes unbounded data needs a per-user/per-target rate limit.
5. **Secrets stay server-side.** Never put a provider key in frontend code or a `VITE_` var.
   Secret files never enter the repo (see `.gitignore`).

## Protected systems — do not change internal logic
A* pathfinding (`data/roomCoordinates.js`), floor-map rendering, chatbot (`chatbot-rules.js`),
AI (`chatbot-llm.js`), teacher lookup, provider integrations. Add controls *around* them
(guards/validation) without altering their behavior; their regression tests must stay green.

## Adding a new endpoint — checklist
- [ ] `auth` middleware applied (unless intentionally public).
- [ ] Authorization: the acting user owns/has-rights-to the exact resource.
- [ ] Input validated, length-bounded, unknown fields rejected.
- [ ] Output is minimal (no leaking other users' data or internal fields).
- [ ] Abuse control if it's expensive / sends messages / writes unbounded data.
- [ ] A test in `backend/test/` (extend `security.test.js` for authz/abuse).
- [ ] Errors are generic to the client; details only in server logs (no secrets/PII).

## Tests & CI
- Run `npm test` in `backend/` before every change — it includes `security.test.js`
  (IDOR, rate limit, input caps, auth). Keep it green.
- CI (`.github/workflows/ci.yml`) runs tests, `npm audit`, the frontend build, and a secret scan
  on every push/PR. Don't merge red.

## Dependencies
- Use `npm ci` (deterministic). Review advisories from `npm audit`; avoid blind `--force`.
- Avoid adding dependencies for things the platform already does.

## Data & privacy (minors)
- Collect the minimum. Don't log full message bodies, emails, tokens, or reset codes.
- Account deletion must remove all of a user's rows (FKs are `ON DELETE CASCADE` + `foreign_keys=ON`).

## Before production changes
- High-risk changes (auth, rate limits, schema, CSP) go through staging first; keep a rollback.
- Prefer expand-contract migrations. Test app rollback against the new schema.
