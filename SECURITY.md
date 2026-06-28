# Security Policy — IA Nexus

IA Nexus is a school navigation tool for Innovation Academy. We take the security and
privacy of our users — who are primarily students (minors) — seriously.

## Reporting a vulnerability

If you believe you've found a security vulnerability, please report it privately:

- **Contact:** `<OWNER: set a monitored security contact, e.g. security@yourdomain>`
- Do **not** open a public issue for security problems.
- Please include: what you found, steps to reproduce, and the potential impact.
- Do not access, modify, or delete data that isn't yours; do not run denial-of-service
  or automated attacks against the live service.

We aim to acknowledge reports within a few days. *(Owner: confirm this mailbox is monitored
before publishing a `/.well-known/security.txt`.)*

## Scope

In scope: the IA Nexus web app and API (authentication, user data isolation, the chat
assistant, route finder, schedule, and teacher directory).

## What we do

- Passwords are hashed (bcrypt); we never store them in plaintext.
- Accounts are isolated — users can only access their own chats and schedule.
- The AI assistant runs server-side; provider API keys are never exposed to the browser.
- Rate limiting protects login, password reset, and the AI endpoint from abuse.
- You can delete your account and all associated data at any time from Settings.

## Data & minors

Because our users are students, we minimize the data we collect (email, display name,
chat history, class schedule) and support full account deletion. Schools/guardians with
questions about student data may contact the address above.
