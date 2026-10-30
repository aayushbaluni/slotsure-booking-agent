# SlotSure — Architecture Diagrams

Companion to **Agentplace Booking Agent — Build Spec.md**. Render with any Mermaid-capable
viewer (VS Code Mermaid preview, GitHub, mermaid.live).

Guiding principle: **the model talks, the API decides.** One booking core owns every rule;
only Postgres has the final word on overlaps.

**Architectural style: ports & adapters (hexagonal).** The core depends on *interfaces only* —
never on Fastify, Prisma, Agentplace, a calendar vendor or a notifier. Everything concrete is
an adapter plugged into a port at the composition root. A new integration is a new adapter
behind an existing port; the core never changes. See **§7 Extensibility** and **design-system.md**.

---

## 1. System architecture (one core, two adapters)

```mermaid
flowchart TB
    subgraph clients["Clients"]
        cust["Prospective client<br/>(logged-out browser)"]
        admin["Ayush<br/>(admin)"]
    end

    subgraph ap["Agentplace Platform"]
        agent["SlotSure Agent — Luna model<br/>conversation · brief collection<br/>slot presentation · adaptive page<br/>review card · confirm prompt"]
    end

    subgraph host["Always-on container (Singapore/Mumbai region)"]
        subgraph api["Fastify API service"]
            direction TB
            mcp["MCP adapter · /mcp<br/>Streamable HTTP · 7 tools<br/><i>built only if Phase 1 needs it</i>"]
            rest["REST adapter · /v1 + /admin<br/>OpenAPI (@fastify/swagger)<br/><i>always built</i>"]

            subgraph plugins["Fastify plugins"]
                plg["auth (bearer) · rate limit<br/>request-id · fault injection<br/>global error handler · helmet/CORS"]
            end

            core["<b>Booking Core</b> (pure TS · Luxon · Zod)<br/>availability · quote · confirm · cancel<br/>date resolver (IST) · service matcher<br/>brief validation · injectable Clock"]

            dbl["DB layer<br/>Prisma 7 + @prisma/adapter-pg<br/>repositories · error mapping (23P01 / 23505 / 25P02)<br/>raw SQL for exclusion constraint"]
        end

        dash["Admin dashboard<br/>React + Vite + TanStack Query<br/>Schedule · Bookings · Events · Controls<br/>+ 'Run the race' button"]
    end

    pg[("PostgreSQL 16<br/>btree_gist EXCLUDE = booking_no_overlap<br/>unique quoteId · resetGeneration<br/><b>source of truth for overlaps</b>")]

    shared["packages/shared<br/>Zod schemas · error codes · envelope types<br/>(one schema → tools, routes, dashboard types)"]

    secrets[["Host secret store<br/>DATABASE_URL · AGENT_API_KEY<br/>ADMIN_TOKEN · QUOTE_SECRET · CODE_SECRET"]]
    reset["Nightly reset job · 03:00 IST<br/>truncate → bump resetGeneration → re-seed"]

    cust --> agent
    agent -->|"MCP tools  OR  REST /v1<br/>(Phase 1 picks ONE)<br/>Authorization: Bearer AGENT_API_KEY"| mcp
    agent -.->|or| rest
    admin -->|"ADMIN_TOKEN"| dash
    dash -->|"/admin routes"| rest

    mcp --> plugins
    rest --> plugins
    plugins --> core
    core --> dbl
    dbl --> pg

    shared -.-> mcp
    shared -.-> rest
    shared -.-> dash
    secrets -.-> api
    reset -->|POST /admin/reset| rest

    classDef truth fill:#2d6a4f,stroke:#1b4332,color:#fff;
    classDef corec fill:#1d3557,stroke:#14213d,color:#fff;
    class pg truth;
    class core corec;
```

**Reading it:** the agent reaches the core through whichever single connection Agentplace
supports (MCP *or* REST — decided in Phase 1). The dashboard always uses REST `/admin`.
Both adapters call the identical core; only the core touches Postgres; the exclusion
constraint is the last line of defence against overlaps.

---

## 2. The 7 operations (quote-then-confirm write path)

```mermaid
flowchart LR
    subgraph reads["Reads (write_state n/a)"]
        a["get_business_info<br/>GET /v1/business"]
        b["list_services<br/>GET /v1/services"]
        c["find_availability<br/>GET /v1/availability"]
    end
    subgraph write["Write path (2 steps so client reviews server facts)"]
        d["quote_booking<br/>POST /v1/quotes<br/><i>no write · signed token</i>"]
        e["confirm_booking<br/>POST /v1/bookings<br/><b>WRITE · idempotent per quote</b>"]
    end
    subgraph manage["Manage (reference + manage code)"]
        f["get_booking<br/>GET /v1/bookings/:ref"]
        g["cancel_booking<br/>POST /v1/bookings/:ref/cancel<br/><b>WRITE · idempotent</b>"]
    end

    c --> d --> e
    e --> f
    f --> g

    adminr["admin-only (never exposed as MCP tools):<br/>GET /admin/bookings · /admin/events<br/>POST /admin/reset · PUT /admin/faults<br/>ops: /healthz · /readyz"]
```

---

## 3. Confirm booking — the reliability story (sequence)

```mermaid
sequenceDiagram
    autonumber
    participant Ag as Agent (Luna)
    participant Ad as Adapter (MCP/REST)
    participant Co as Booking Core
    participant DB as PostgreSQL 16

    Ag->>Ad: confirm_booking(quote_token, name, type, brief, confirmed)
    Ad->>Ad: Zod validate · reject email/phone in brief · attach request_id
    Ad->>Co: verify quote HMAC signature

    alt Replay path (quote_id already booked)
        Co->>DB: SELECT booking WHERE quoteId = ?
        DB-->>Co: existing row (any status)
        Co-->>Ag: ok · replayed:true · CURRENT status · same ref + code
        Note over Co,DB: no expiry/version/availability checks · no row written
    else New-booking path
        Co->>Co: check generation · book_by · service version
        Co->>DB: BEGIN
        loop each eligible staff in sortOrder
            Co->>DB: SAVEPOINT try_staff · INSERT
            alt success
                DB-->>Co: inserted
                Co->>DB: RELEASE · write booking_events · COMMIT
                Co-->>Ag: ok · CONFIRMED · reference + manage_code
            else 23P01 exclusion violation
                DB-->>Co: overlap
                Co->>DB: ROLLBACK TO SAVEPOINT try_staff (try next)
            else 23505 unique quoteId (concurrent same quote won)
                DB-->>Co: dup
                Co->>DB: ROLLBACK · re-read
                Co-->>Ag: ok · replayed:true (the winner's row)
            end
        end
        Note over Co,Ag: all staff conflict → SLOT_UNAVAILABLE · write_state:"none" · 3 alternatives
    end
```

---

## 4. Outcome decision — what the agent says (write_state)

```mermaid
flowchart TD
    start([confirm / cancel call returns]) --> q{response arrived?}
    q -->|"no (timeout / dropped)"| unk
    q -->|yes| ok{ok?}

    ok -->|"ok:true"| st{status?}
    st -->|CONFIRMED| booked["'Booked: … reference …, manage code …'"]
    st -->|CANCELLED| wascan["'That booking was made and later cancelled.'<br/>offer a new time"]

    ok -->|"ok:false"| ws{write_state?}
    ws -->|"'none'"| none["'That didn't go through — nothing was booked.'<br/>+ next step"]
    ws -->|"'unknown'"| unk

    unk["'I couldn't verify whether that completed.<br/>I'll check using the same request.'"] --> retry["ONE automatic retry · SAME quote_token"]
    retry --> q2{answered?}
    q2 -->|yes| ok
    q2 -->|"still unknown"| stop["'I still can't verify it. I've kept your<br/>request and can check again whenever you ask.'<br/>STOP — retry only on request · never re-quote"]

    classDef danger fill:#9d0208,stroke:#6a040f,color:#fff;
    classDef safe fill:#2d6a4f,stroke:#1b4332,color:#fff;
    class none,stop danger;
    class booked safe;
```

---

## 5. Data model (key relations + constraints)

```mermaid
erDiagram
    Business ||--o{ Service : has
    Business ||--o{ Staff : has
    Business ||--o{ OpeningHours : has
    Business ||--o{ Closure : has
    Business ||--o{ Booking : has
    Service  ||--o{ StaffService : offered_by
    Staff    ||--o{ StaffService : offers
    Service  ||--o{ Booking : "Restrict delete"
    Staff    ||--o{ Booking : "Restrict delete"
    Booking  ||--o{ BookingEvent : audited_by

    Business {
        int resetGeneration "bumped every reset · quotes carry it"
        int minLeadMins "60"
        int maxDaysAhead "14"
        int slotStepMins "15"
        int cancelCutoffMins "120"
        string timezone "Asia/Kolkata"
    }
    Service {
        int version "bumped on edit → QUOTE_STALE"
        int durationMins
        int bufferMins
        bool active
    }
    Booking {
        string reference "SB-7K2Q9 · Crockford base32"
        string manageCodeHash "SHA-256 of HMAC-derived code"
        string quoteId "UNIQUE · replay anchor"
        datetime startsAt "tstz"
        datetime blockedUntil "end + buffer · EXCLUDE range"
        int generation "reset gen at issue"
        enum status "CONFIRMED | CANCELLED"
        bool isDemo "always true"
    }
    BookingEvent {
        string type "created|replayed|conflict_rejected|cancelled|..."
        string requestId
        json detail "never name/brief/code"
    }
```

**The constraint that does the real work:**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "blockedUntil", '[)') WITH &&
  ) WHERE (status = 'CONFIRMED');
```

`WHERE status = 'CONFIRMED'` → a cancelled booking frees its slot instantly.
`[)` half-open range → a 10:00–10:30 booking sits flush against a 10:30 one.

---

## 6. Build phases (Phase 1 is a hard gate)

```mermaid
flowchart LR
    p0["Phase 0<br/>Profile + setup<br/>~0.5d"] --> p1
    p1["Phase 1 ★ GATE<br/>Integration spike:<br/>MCP or REST? secret? timeout?<br/>confirmation gate? one IP?<br/>~1d"] --> p2
    p2["Phase 2<br/>Core + full journey<br/>schema · adapter · agent<br/>~2d"] --> p3
    p3["Phase 3<br/>Reliability: races · replay<br/>reset · faults · rate limits<br/>~2d"] --> p4
    p4["Phase 4<br/>Dashboard · note · demo video<br/>~1.5d"]

    classDef gate fill:#bc6c25,stroke:#8a5012,color:#fff;
    class p1 gate;
```

Phase 1 decides the agent-facing adapter, secret handling, and the confirmation strategy —
everything downstream depends on what the platform can actually do. Only the adapter that
works gets kept.

---

## 7. Extensibility — ports & adapters (loose coupling)

The whole system is built so that **adding an integration never touches the core**. The core
is a pure domain that speaks only to *ports* (TypeScript interfaces in `packages/shared`).
Concrete tech lives in *adapters*. A composition root (the **integration registry**) wires
adapters to ports from config at startup. Swap Postgres for something else, add a real
calendar, add WhatsApp, add a second agent platform — each is one new adapter + one registry
line. Nothing else moves.

```mermaid
flowchart LR
    subgraph driving["Driving adapters (inbound) — how the world calls in"]
        rest2["REST adapter /v1 /admin"]
        mcp2["MCP adapter /mcp"]
        future_in["▸ future: another agent<br/>platform · CLI · webhook"]
        dash2["dashboard → REST /admin"]
    end

    subgraph hex["CORE (pure domain · no I/O)"]
        direction TB
        bp(["BookingPort<br/>(driving port — the 7 ops<br/>as a clean app API)"])
        dom["Availability · Quote · Booking<br/>Cancellation · DateResolver<br/>ServiceMatcher · BriefValidator"]
        bp --> dom
    end

    subgraph driven["Driven ports (outbound) — what the core needs"]
        direction TB
        repoP(["RepositoryPort"])
        clockP(["ClockPort"])
        tokenP(["TokenSignerPort"])
        codeP(["CodeDeriverPort"])
        eventP(["EventSinkPort"])
        calP(["CalendarPort"])
        notifP(["NotifierPort"])
        rlP(["RateLimiterPort"])
        faultP(["FaultPort"])
    end

    subgraph adapters["Driven adapters (swappable)"]
        direction TB
        repoA["PrismaPgRepository → Postgres 16"]
        clockA["SystemClock · FrozenClock(tests)"]
        tokenA["HmacSha256Signer"]
        codeA["CrockfordCodeDeriver"]
        eventA["DbEventSink (+ future: webhook/bus)"]
        calA["NoopCalendar · ▸Google · ▸Outlook"]
        notifA["NoopNotifier · ▸Email · ▸SMS · ▸WhatsApp"]
        rlA["InMemory/Redis limiter"]
        faultA["FaultInjector (demo only)"]
    end

    rest2 --> bp
    mcp2 --> bp
    future_in -.-> bp
    dash2 --> rest2

    dom --> repoP --> repoA
    dom --> clockP --> clockA
    dom --> tokenP --> tokenA
    dom --> codeP --> codeA
    dom --> eventP --> eventA
    dom --> calP --> calA
    dom --> notifP --> notifA
    dom --> rlP --> rlA
    dom --> faultP --> faultA

    classDef corec fill:#1d3557,stroke:#14213d,color:#fff;
    classDef port fill:#2d3142,stroke:#1b1f2a,color:#fff;
    class dom,bp corec;
    class repoP,clockP,tokenP,codeP,eventP,calP,notifP,rlP,faultP port;
```

### The ports (stable contracts)

| Port | Core needs it for | Demo adapter | Future adapters (drop-in) |
| --- | --- | --- | --- |
| `BookingPort` (driving) | the 7 operations as one app-level API | — (called by adapters) | — |
| `RepositoryPort` | persist & read bookings/events; run the race-safe tx | `PrismaPgRepository` | any SQL store with range-exclusion |
| `ClockPort` | resolve "now" in IST; freeze in tests | `SystemClock` / `FrozenClock` | — |
| `TokenSignerPort` | sign & verify quote tokens | `HmacSha256Signer` | KMS-backed signer, versioned keys |
| `CodeDeriverPort` | derive/verify manage codes | `CrockfordCodeDeriver` | versioned-key deriver |
| `EventSinkPort` | emit audit/domain events | `DbEventSink` | webhook, Kafka/NATS, analytics |
| `CalendarPort` | reflect a booking on a real calendar | `NoopCalendar` (demo-safe) | Google, Outlook, CalDAV |
| `NotifierPort` | confirm/cancel notifications | `NoopNotifier` (demo-safe) | Email, SMS, WhatsApp |
| `RateLimiterPort` | throttle reads/writes & code guesses | in-memory | Redis (multi-instance) |
| `FaultPort` | inject latency/503/fail-after-commit | `FaultInjector` | no-op in prod |

> The demo's `Noop` calendar/notifier adapters are what enforce the spec's **demo-safety rule**
> ("nothing touches a real calendar, no message is sent"). Turning the product real later is
> literally swapping two no-op adapters for real ones — the booking logic is untouched.

### Adding an integration — the whole procedure

```mermaid
flowchart LR
    s1["1 · Implement the port<br/>new class implements e.g.<br/>NotifierPort (one file)"] --> s2
    s2["2 · Register it<br/>one line in the composition root,<br/>selected by env flag<br/>NOTIFY=email"] --> s3
    s3["3 · Ship<br/>core untouched · tests untouched ·<br/>other adapters untouched"]
```

Three rules keep it frictionless and enforce the coupling boundary:

1. **Dependency direction is one-way.** `core` imports from `packages/shared` (ports/types) only.
   It must never import `apps/api` adapters, Fastify, or Prisma. An ESLint
   `no-restricted-imports` / import-boundary rule fails the build if it does.
2. **The registry is the only wiring place.** `apps/api/src/composition.ts` reads env and binds
   each port to one adapter. Nothing else constructs adapters. Feature flags
   (`CALENDAR=noop|google`, `NOTIFY=none|email`, `STORE=postgres`, `LIMITER=memory|redis`)
   choose at boot; tests bind fakes the same way.
3. **Contracts live once.** Every port and every envelope is a Zod schema in `packages/shared`,
   so an adapter that drifts from the contract fails type-check, and the dashboard/tool schemas
   stay in lockstep automatically.

This is why "new integrations are smooth": the blast radius of any integration is exactly one
adapter file and one registry line.

---

## 8. Design system

The UI (admin dashboard now, agent adaptive page later) is **strictly token-driven** and
follows **design-system.md** — a **dark command-center** aesthetic, intentionally *not* the
BusinessNext brand. Single source of truth: `packages/shared/design/tokens.ts` → consumed as
CSS variables and a Tailwind preset. No component hardcodes a hex value; a lint rule forbids
raw colors outside the tokens file. See **design-system.md** for the full spec.
