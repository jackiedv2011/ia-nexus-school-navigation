# Load, abuse, and what actually happens at the bell

Two different problems get lumped together as "can it handle traffic". They have
different answers, and it is worth being precise about which is which.

1. **The bell.** ~1,500 students open the app in the same few seconds, several
   times a day, from a single school IP address. This is normal, expected,
   friendly traffic. It is handled, and measured below.
2. **A denial-of-service attack.** Someone trying to take the site down.
   Application code can absorb a lot of this, and this app now does — but a
   genuine *volumetric* attack cannot be stopped by the application at all, for
   reasons explained in "The honest limit" below.

---

## The bell

### What was measured

A real Postgres, the real server, 1,500 simultaneous route requests from one IP
— which is exactly what the schedule page produces when the bell rings, because
it fetches the route to your next class automatically.

| | before | after |
|---|---|---|
| wall clock for all 1,500 | 3,365 ms | **1,140 ms** |
| p50 latency | 2,261 ms | **~1,000 ms** |
| p95 latency | 3,254 ms | **1,127 ms** |
| failed or rate-limited | 0 | **0** |

### Where the time was actually going

Profiled rather than guessed, at 1,500 concurrent operations:

```
findPath CPU, 1500 routes ......... 1747 ms   <- the bottleneck
rate_limits, one hot row ..........  267 ms
rate_limits, 1500 distinct keys ...  156 ms
trivial SELECT 1 ..................  102 ms
```

The database was never the problem. Routing was: 1.2 ms of CPU per request on
Node's single thread, so 1,500 of them meant 1.7 seconds during which nothing
else could run.

### What changed

**A route cache** (`backend/data/roomCoordinates.js`). A route is a pure
function of `(from, fromFloor, to, toFloor)` over data that only changes when
the app is redeployed, and the building is ~78 rooms, so the whole answer space
is small and bounded. An LRU of 3,000 entries turns the bell into a handful of
cache misses. 1,500 identical routes: **1,747 ms → 6 ms**. Results are frozen,
so one caller cannot corrupt the answer for everyone who asks later.

**Static caching** (`backend/staticCache.js`) — the biggest real-world win, and
the one that does not show up in a synthetic loop. Everything was served with
`max-age=0`, including the content-hashed 331 KB JS bundle, so every student
re-validated every asset at the bell. Now:

| | before | after |
|---|---|---|
| requests on a repeat visit | 7 | **1** |
| bytes on a repeat visit | ~450 KB | **~1 KB** |
| across 1,500 students | ~10,500 requests, ~675 MB | **~1,500 requests, ~1.6 MB** |

Measured with a real browser, counting what the server actually received.
`/assets/*` and `/fonts/*` are content-hashed so they are immutable for a year;
floor plans revalidate hourly (a corrected map must still be able to reach
people); `index.html` is `no-cache` because it names the current asset hashes.

**Rate limiting moved off the hot path.** The whole school is behind one NAT
address, so every request incremented the *same* Postgres row and serialised on
it — the busiest second of the day was also the most contended. Counting now
happens in memory and flushes to Postgres every 10 seconds.

That has a second benefit worth stating plainly: **a database outage no longer
takes down the route finder or guest chat.** Neither needs a database, but both
used to return 503 because the limiter could not reach one. There is a test for
this.

The trade-off, stated honestly: with more than one server instance, each counts
its own share, so the effective per-IP ceiling is roughly `limit × instances`
until the next flush. That is fine for a gross-abuse ceiling sized for a whole
school. The two limits where exactness is the point — the **global AI spend
budget** and the **password-reset email throttle** — deliberately still go
straight to Postgres.

---

## Abuse and attack

Every one of these was run against the running server. Results are what the
server actually did, not what it is supposed to do.

| Attack | Result |
|---|---|
| 5 MB request body | `413` — bodies capped at 64 KB |
| 20,000-deep nested JSON | `400` in 10 ms — no parser blow-up |
| 60 KB request header | `431` — Node's header cap |
| 120 slowloris sockets (half-sent requests, held open) | all closed by the server after 13 s with `408`; the site stayed healthy throughout |
| 80 admin-key guesses from one IP | 60 × `401`, then `429` |
| 400 concurrent guest chat messages | all `200` |
| 1,500 concurrent route requests | all `200`, p50 1 s |

### Slowloris deserves a note

It is the cheapest attack on this list: open sockets, send half a request each,
never finish. On Node's defaults those sockets are held forever.

Two things about the fix are easy to get wrong, and both were wrong here until a
real slowloris was run against the server:

* The timeouts must be passed to `http.createServer(options, app)`, **not**
  assigned to the server afterwards. Assigned, they are only *checked* every
  `connectionsCheckingInterval`, which defaults to 30 seconds — so a 10-second
  timeout does nothing useful.
* `headersTimeout` must be **≤** `requestTimeout`. Node throws if you construct
  it the other way round, and misbehaves quietly if you assign it.

`backend/test/resilience.test.js` opens real half-open sockets and asserts the
server closes them, because a config assertion would not have caught either bug.

### The other controls

- **Per-IP ceiling**, default 4,000/min — sized for the whole school behind one
  NAT, not per student. `RATE_IP_MAX`.
- **Per-account login lockout**, 5 failures / 15 min, keyed by email so it works
  despite the shared IP, and stored in Postgres so a redeploy cannot clear it.
- **Per-user message limits**, 20/min and 150/hour.
- **A global AI spend ceiling**, 60/min and 1,000/hour across everyone, so many
  free accounts cannot run up an Anthropic bill. Durable.
- **Load shedding**: a hard ceiling on in-flight requests (`MAX_INFLIGHT`,
  default 2,000) returns a fast `503` with `Retry-After` rather than accepting
  work the process cannot finish. Node has no natural back pressure — without
  this it accepts everything and runs out of memory.
- **Connection ceiling** (`MAX_CONNECTIONS`, default 10,000) so a connection
  flood cannot exhaust file descriptors.
- **The health check is not an amplifier.** It was unauthenticated, unlimited,
  and ran a database query per request, so hammering it exhausted the connection
  pool. The probe is now cached for 5 s and concurrent probes collapse into one
  query: 200 health checks cost ≤ 2 queries. It stays exempt from load shedding
  so an overloaded server can still tell the platform it is alive.

---

## The honest limit

**None of the above stops a real DDoS**, and no amount of application code can.

If someone points 10 Gbps at this server, the traffic saturates the network link
and fills the platform's queue before a single line of this code executes. The
same is true of a large botnet sending well-formed requests from thousands of
different addresses: each one looks like a different student, so per-IP limits
do not fire, and the only thing that helps is capacity.

Stopping that requires a layer **in front of** the app, which sees the traffic
before your server does.

### What to do about it

For a school project on Render, the answer is Cloudflare's free tier, which is
genuinely enough:

1. Put the domain on Cloudflare and point it at the Render service with the
   proxy on (orange cloud). Traffic now terminates at Cloudflare, not at Render.
2. Turn on **"Under Attack" mode** only when actually under attack — it
   challenges every visitor, which would be miserable during a normal bell.
3. Add a **rate-limiting rule** as a coarse outer bound, well above a real bell:
   the whole school shares one IP, so anything tighter than a few thousand
   requests per minute per IP will lock out the entire student body. Start at
   roughly 3× measured peak and tune from real traffic.
4. Enable **caching for `/assets/*` and `/fonts/*`**. Those are already served
   `immutable`, so Cloudflare will hold them at the edge and the bell mostly
   never reaches Render at all.
5. Leave `/api/*` uncached.

Then set `FRONTEND_URL` to the real domain, since the app deliberately refuses
to build email links from an unverified `Host` header.

### Where the remaining ceiling is

With Cloudflare in front and the changes above, the limits in rough order:

1. **One Node process, one CPU core.** Render's smaller instances are single
   core, and Node is single-threaded. Measured throughput is ~1,300 req/s for
   cached routes. A bell is ~1,500 requests spread over several seconds, so
   there is real headroom — but this is the first wall.
   *If you outgrow it:* run `node --cluster` or raise the instance size before
   reaching for anything cleverer. Note the in-memory rate limiting caveat above
   when you do.
2. **Postgres connections.** The pool is capped at 20 (`DB_POOL_MAX`) because
   Supabase's pooler has a real ceiling. The route finder and guest chat no
   longer touch it, so this now only limits signed-in traffic.
3. **Supabase's free-tier bandwidth**, which the asset caching helps with more
   than anything else here.

---

## Re-running any of this

The measurements above are reproducible:

```bash
# A throwaway Postgres to test against
/usr/lib/postgresql/16/bin/initdb -D /var/tmp/pgdata -U postgres --auth=trust
/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgdata -o '-p 5433' start
createdb -h 127.0.0.1 -p 5433 -U postgres ianexus

# The full suite, including the 9 security tests that need a database
DATABASE_URL=postgresql://postgres@127.0.0.1:5433/ianexus npm test --prefix backend
```

The load and attack scripts used to produce the tables above are not committed —
they are throwaway. The behaviour they verified is covered permanently by
`backend/test/resilience.test.js`, which runs in CI without a database.
