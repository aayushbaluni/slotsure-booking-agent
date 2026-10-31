# SlotSure — Technical note

**Live:** agent API + MCP at `https://slotsure.161-118-179-38.sslip.io` (tools at `/mcp`) ·
admin dashboard at `https://slotsure-admin.161-118-179-38.sslip.io` ·
repo `github.com/aayushbaluni/slotsure-booking-agent`.

## 1. What I built

A booking agent for my own freelance software practice. A prospective client chats to describe a
project and book a **demonstration** discovery call with me, then look it up and cancel it — all in
chat. The agent talks; a TypeScript/Fastify API decides. Every fact the client sees — services,
capabilities, times, availability, booking outcomes — comes from an API response in that turn; the
model never invents one.

**Demo boundary (non-negotiable):** every booking is a demonstration. No code path writes to a real
calendar or sends a message — enforced structurally by `NoopCalendar` / `NoopNotifier` adapters, not
by discipline. Only a first name and a short project brief are collected; a brief that contains an
email or phone number is rejected. Data is wiped on the nightly reset.

## 2. How it fits together

One **booking core** (pure TypeScript + Luxon + Zod) owns every rule. It depends only on *ports*
(interfaces in `packages/shared`); nothing concrete. Two **driving adapters** call it — an **MCP
server** at `/mcp` (the agent-facing connection, chosen in Phase 1) and a **REST API** under `/v1`
and `/admin` (dashboard, tests, and the fallback if a platform prefers API integration). **Driven
adapters** behind the core — Postgres repository, HMAC token signer, Crockford code deriver, event
sink, calendar, notifier, rate limiter, fault injector — are wired at one composition root from env
flags. See `architecture.md` for the diagram. *The API, not the model, owns facts.*

This ports-and-adapters shape paid off immediately: the MCP adapter (Phase 1) was added as a second
driving adapter with **zero changes to the core**, and the demo-safety guarantee is literally two
no-op adapters you later swap for real ones.

## 3. Key decisions

- **A Postgres exclusion constraint, not application locks.** `EXCLUDE USING gist (staffId WITH =,
  tstzrange(start, blockedUntil) WITH &&) WHERE status='CONFIRMED'`. Correctness lives in the
  database, so no app race can double-book. Multi-resource attempts use a `SAVEPOINT` per staff; the
  naive catch-and-continue fails with `25P02`, which a control test demonstrates.
- **`write_state` separates "known failed" from "unknown".** `none` → the agent says *"didn't go
  through"*; `unknown` (or a transport timeout) → *"couldn't verify, checking"* and one automatic
  retry with the same quote. This is the honesty primitive; it even drives the dashboard's colours.
- **Quote-then-confirm, with the quote id as the replay key, checked *before* expiry.** A quote
  holds no slot; confirm re-checks every rule. A repeated/retried confirm with the same quote id
  returns the same booking (no duplicate), even past the 10-minute expiry and even after the booking
  was cancelled.
- **Reset generation** on the business invalidates pre-reset quotes after a nightly reset.
- **Derived manage codes with throttling, never lockout** — `HMAC(CODE_SECRET, quoteId)` → 6
  Crockford symbols; wrong code and unknown reference return the same `BOOKING_NOT_FOUND`.
- **`say` strings** so a small model relays a correct sentence rather than composing one; **server
  resolves dates** (IST) from the client's words; **capabilities are data** so the agent can't
  overclaim.

## 4. Validation

Tested by layer, against **real Postgres** (never mocked for anything touching the constraint):

- **28 automated tests pass** (`pnpm --filter @slotsure/api test`): pure-rule units + DB integration.
- **Concurrency/replay** (`race.test.ts`): `T-C1` 20 parallel confirms → exactly **1 booking, 19
  rejected**; `T-C4` same quote ×10 → **1 row, 9 replays, one reference**; `T-C5` two resources →
  2 on different staff + savepoint fallback; the **`25P02` control** proving why savepoints are
  needed. Stable across repeated runs.
- **Reliability over HTTP** (`phase3.test.ts`, via `fastify.inject`): fault injection (`error_503`
  → `write_state:none`; `fail_after_commit` → `unknown` → retry **replays the one booking**),
  reset-generation (`QUOTE_INVALID`), manage-code throttle, admin-token scoping, the event log, and
  the server-side "run the race" (1 created / 9 rejected). Plus **F2**: a statement past the 3s
  timeout is cancelled (`57014`).
- **MCP verified live** over public HTTPS: a real MCP client lists all 7 tools and calls them,
  returning IST slots. Reads and the full quote→confirm→lookup→cancel journey verified by curl.
- **CI** (GitHub Actions): lint (core→adapter import-boundary) → typecheck → migrate+seed against a
  Postgres service → the full suite → build → gitleaks.

A real bug the race test earned its keep on: under load, the multi-resource path hit a **deadlock
(`40P01`)**. Exclusion constraints can deadlock under concurrency, so the write path now **retries**
transient failures (deadlock / serialization / cancellation) — nothing committed, so it is safe —
and the write pool uses a short `lock_timeout` so contended inserts fail fast and retries cycle
quickly.

**Not yet done:** the scripted agent conversation evals (`E-01…E-15`) against the published Agentplace
agent — they run once the agent is published and the platform observations below are complete.

## 5. Where I hit Agentplace's limits

Phase 1 is a deliberate gate; findings are tracked in `docs/platform-findings.md`. From the docs:
a custom service connects as *"a compatible MCP connection or an API integration,"* with **no
documented general form for a custom REST endpoint** — so I built and deployed the **MCP** adapter
(and kept REST as the proven fallback). The docs also state *"a displayed recommendation or proposed
booking is not confirmation of an external write,"* which is exactly the confirmation concern below.

**The confirmation gap.** `confirm_booking` takes `customer_confirmed: true`, but that is an argument
the model supplies — a guard against *accidentally* skipping the step, not independent proof a human
agreed. Whether Agentplace offers a model-proof confirmation has to be observed on the live agent. If
it does not, the production fix is a **trusted confirmation page**: `quote_booking` also returns a
one-time link to a small page our API serves; the booking is written only when that page POSTs with
the quote token and a single-use nonce, so the model cannot complete the write on its own.

*Still-open live observations (need the published agent): request timeout, whether it retries tool
calls, whether tool errors reach the model, single-IP vs per-client, and which adaptive-page
components actually render. The design is already defensive about all of these — errors are returned
as normal tool content so `say` + `write_state` are always visible, replay is idempotent against
platform retries, and there is a global demo cap plus a plain-chat fallback if components don't render.*

## 6. What I'd change for production

**Implemented and ready to flip on** (the ports already exist; it's an adapter swap at the
composition root): real calendar sync (`CalendarPort` → Google / Outlook) replacing `NoopCalendar`;
notifications with consent (`NotifierPort` → email / SMS / WhatsApp) replacing `NoopNotifier`; a
Redis rate limiter for multiple instances.

**Planned:** client verification beyond a manage code; slot *holds* for genuinely busy calendars (the
quote deliberately holds nothing today); rescheduling as one operation (currently cancel + rebook);
indicative estimates from approved pricing rules; **key rotation** with versioned token/code keys
(fixed today so replays re-derive the same code); alerting on error and conflict rates; a retention
policy beyond the nightly wipe.

**Operational notes I'd tidy:** the container currently runs via `tsx` because `@slotsure/shared` is
consumed as TypeScript source through the workspace exports — fine at this scale, but I'd compile
`shared` to `dist` and run plain `node` for a production image; and I'd move CI's DB integration to
Testcontainers (I used an external Postgres here because the sandbox couldn't build its native deps).
