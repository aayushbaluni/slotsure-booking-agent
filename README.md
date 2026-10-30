# SlotSure

A published Agentplace agent that lets a prospective client of Ayush Baluni's freelance
software practice describe a project and book a **demo** discovery call — backed by a
reliability-first TypeScript/Fastify booking API that is the single authority for services,
availability and booking state. **The model talks; the API decides.**

> All bookings are demonstrations. No code path writes to a real calendar or sends a message.

## Design docs

| Doc | What it is |
| --- | --- |
| `Agentplace Booking Agent — Build Spec.md` | The full build spec (requirements, data model, contracts, tests, plan) |
| `architecture.md` | Architecture diagrams — one core, ports & adapters, the confirm sequence, the `write_state` decision tree |
| `design-system.md` | The "Command-Center" dark design system (token-driven, not the BusinessNext brand) |

## Monorepo layout

```
slotsure/ (this repo)
├─ apps/
│  ├─ api/            Fastify service — booking core + REST/MCP adapters + Prisma
│  └─ dashboard/      Vite + React admin dashboard (TanStack Query, Tailwind from shared tokens)
├─ packages/shared/   Zod schemas, error catalogue, envelope, PORTS, design tokens — the contract boundary
├─ agent/             Builder instructions, tool descriptions, evals
└─ docs/              technical note, platform findings (Phase 1), demo script
```

### Loose coupling (ports & adapters)

The booking core depends only on interfaces in `packages/shared/src/ports`. Concrete tech
(Postgres, HMAC, calendar, notifier, rate limiter) are adapters wired at the composition root
(`apps/api/src/composition.ts`) from env flags. **Adding an integration = one new adapter file +
one registry line; the core never changes.** See `architecture.md` §7.

## Prerequisites

- **Node 22+** and **pnpm via corepack** (`corepack enable`). The repo pins `pnpm@9.12.0`.
- **Docker** (for local Postgres 16) — or any Postgres 16 with `CREATE EXTENSION btree_gist`.

## Run it locally

```bash
pnpm install

# 1. secrets — copy the example and fill in (each ≥32 bytes):
cp .env.example .env
#    generate values with:  openssl rand -base64 48

# 2. database (Postgres 16). Default host port is 5432; override if it's taken:
docker compose up -d db
#    on a busy 5432:  DB_PORT=5434 docker compose up -d db   (then set the port in .env's DATABASE_URL)

# 3. design tokens (generates tokens.css + the Tailwind preset — required before the dashboard builds):
pnpm design:build

# 4. schema + the exclusion constraint + seeded demo data:
pnpm db:migrate        # applies prisma/migrations (incl. booking_no_overlap)
pnpm db:seed           # business profile, 2 services, Ayush, call hours

# 5. run:
pnpm dev               # api on :3000 (/v1), dashboard on :5173
```

> **Reach the API at `http://127.0.0.1:3000`, not `localhost`** — the server binds IPv4 and
> `localhost` may resolve to IPv6 `::1` first.

`pnpm reset` clears bookings/events, bumps the reset generation, and re-seeds.

### Try the journey (API is runnable now)

```bash
curl -s 127.0.0.1:3000/v1/services
curl -s "127.0.0.1:3000/v1/availability?service=discovery&date=tomorrow&limit=3"
# POST /v1/quotes {service,start} -> quote_token
# POST /v1/bookings {quote_token, customer_name, project_type, project_brief, customer_confirmed:true}
# GET  /v1/bookings/:reference?manage_code=...   |   POST /v1/bookings/:reference/cancel
```

Admin routes need the `ADMIN_TOKEN` as `Authorization: Bearer …`: `GET /admin/bookings`,
`GET /admin/events`, `POST /admin/reset`, `PUT /admin/faults` (fault injection, demo only).

## Test

```bash
pnpm lint          # ESLint — enforces the core→adapter boundary (architecture.md §7)
pnpm typecheck     # tsc across all packages
pnpm build         # emit all packages

# unit only (no database needed) — DB integration tests auto-skip:
pnpm --filter @slotsure/api test

# full suite incl. concurrency/replay/fault/reset tests — point at a Postgres 16:
DATABASE_URL=postgresql://slotsure:slotsure@localhost:5432/slotsure?schema=public \
  pnpm --filter @slotsure/api test
pnpm --filter @slotsure/api test:race    # just the race checks (T-C1/T-C4/T-C5 + the 25P02 control)
```

What's proven today (against real Postgres): the full booking journey, concurrency (exactly one
of N parallel confirms wins), retry/replay idempotency, `write_state` honesty, reset-generation,
fault injection (503 / fail-after-commit), manage-code throttling, admin scoping, and the 3s
statement timeout.

## Push / CI

`.github/workflows/ci.yml` runs on push/PR to `main`: install → design:build → lint → typecheck →
migrate + seed against a Postgres service → full test suite → build → gitleaks secret scan.

Secrets live only in `.env` (gitignored) and the host's secret store — never committed; `.env.example`
documents the shape. Generated artifacts (`tokens.css`, the Tailwind preset, Prisma client, `dist/`)
are gitignored, so a fresh clone runs `pnpm design:build` before building the dashboard (step 3 above).

## Build status

Phases 0–3 done: contracts/ports, the booking core and full journey, the race-safe write path, and
reliability (concurrency, replay, reset, faults, rate limits, timeouts, event log) — all verified by
unit + integration tests. **Phase 4 in progress:** the admin dashboard (Schedule / Bookings / Events /
Controls + a server-side "Run the race") is built and wired to the admin API; open it with
`pnpm --filter @slotsure/dashboard dev` and enter the `ADMIN_TOKEN`.

**Still ahead:** Phase 1 platform spike + the agent-facing adapter (MCP built only if needed), and the
rest of Phase 4 (sample seed bookings so the schedule starts populated, demo video, deploy). The MCP
adapter is intentionally stubbed with `TODO(Phase 1)`. The next weekday 19:00 IST slot is reserved as
the **race-demo slot**.

## Live

- API + MCP: `https://slotsure.161-118-179-38.sslip.io` (MCP at `/mcp`)
- Admin dashboard: `https://slotsure-admin.161-118-179-38.sslip.io`

Deployed via `deploy/oracle/deploy.sh` (see `docs/DEPLOY.md`). It's a demo: all bookings are
demonstrations, no real calendar or messages are touched.

## License

[MIT](LICENSE) © 2026 Ayush Baluni. Open source — fork it, learn from it, build on it.
