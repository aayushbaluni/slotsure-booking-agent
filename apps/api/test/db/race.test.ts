import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { ulid } from "ulid";
import { PrismaPgRepository } from "../../src/db/repository.js";
import { generateReference } from "../../src/core/reference.js";
import type { CreateBookingInput, QuotePayload } from "@slotsure/shared/ports";

/**
 * The concurrency + replay checks (build spec §10), run against a REAL Postgres with the live
 * exclusion constraint — never a mock, because the guarantee only exists in Postgres. Set
 * DATABASE_URL to a Postgres 16 that has the migration applied; the suite skips otherwise so the
 * pure unit tests still run without a database.
 *
 * Isolated fixture (race-*) so it never touches seeded demo data. The exclusion constraint is
 * global per staffId, so the fixture uses its own staff rows and a far-future slot.
 */
const url = process.env.DATABASE_URL;

const BIZ = "race-biz";
const SVC = "race-svc";
const STAFF_A = "race-staff-a";
const STAFF_B = "race-staff-b";
const SLOT = "2027-03-01T13:00:00.000Z"; // far future, never offered by availability
const DURATION = 30;
const BUFFER = 15;

const startsAt = new Date(SLOT);
const endsAt = new Date(startsAt.getTime() + DURATION * 60_000);
const blockedUntil = new Date(endsAt.getTime() + BUFFER * 60_000);

function makePayload(quoteId: string): QuotePayload {
  const now = new Date();
  return {
    quote_id: quoteId,
    service_id: SVC,
    service_version: 1,
    generation: 1,
    start: SLOT,
    duration_mins: DURATION,
    buffer_mins: BUFFER,
    price_paise: 0,
    issued_at: now.toISOString(),
    book_by: new Date(now.getTime() + 10 * 60_000).toISOString(),
    replay_until: new Date(now.getTime() + 7 * 864e5).toISOString(),
  };
}

function input(payload: QuotePayload, staffIds: string[]): CreateBookingInput {
  return {
    businessId: BIZ,
    payload,
    serviceName: "Race service",
    manageCodeHash: "x".repeat(64),
    reference: generateReference() + "-" + ulid().slice(-6), // unique per call
    customerName: "Racer",
    projectType: "other",
    projectBrief: "concurrency fixture booking for the race test suite.",
    eligibleStaffIds: staffIds,
    requestId: `req_${ulid()}`,
  };
}

const INSERT_SQL = `INSERT INTO "Booking" (
  "id","businessId","reference","manageCodeHash","quoteId","serviceId","staffId",
  "startsAt","endsAt","blockedUntil","serviceName","durationMins","bufferMins",
  "pricePaise","serviceVersion","generation","customerName","projectType","timeline",
  "projectBrief","status","isDemo","createdAt"
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'CONFIRMED',true,now())`;

function insertValues(staffId: string, quoteId: string, reference: string): unknown[] {
  return [
    `bk_${ulid()}`, BIZ, reference, "x".repeat(64), quoteId, SVC, staffId,
    startsAt, endsAt, blockedUntil, "Race service", DURATION, BUFFER,
    0, 1, 1, "Racer", "other", null, "fixture booking for the race test suite.",
  ];
}

describe.skipIf(!url)("race: concurrency + replay (real Postgres)", () => {
  let repo: PrismaPgRepository;
  let pool: Pool;

  beforeAll(async () => {
    repo = PrismaPgRepository.create(url!);
    pool = new Pool({ connectionString: url, max: 20 });
    // fixture (idempotent)
    await pool.query(
      `INSERT INTO "Business" ("id","name","timezone","currency","capabilities")
       VALUES ($1,'Race biz','Asia/Kolkata','INR','{}') ON CONFLICT ("id") DO NOTHING`,
      [BIZ],
    );
    await pool.query(
      `INSERT INTO "Service" ("id","businessId","name","aliases","durationMins","bufferMins","pricePaise")
       VALUES ($1,$2,'Race service','{}',$3,$4,0) ON CONFLICT ("id") DO NOTHING`,
      [SVC, BIZ, DURATION, BUFFER],
    );
    for (const [id, order] of [[STAFF_A, 100], [STAFF_B, 101]] as const) {
      await pool.query(
        `INSERT INTO "Staff" ("id","businessId","displayName","sortOrder")
         VALUES ($1,$2,$3,$4) ON CONFLICT ("id") DO NOTHING`,
        [id, BIZ, id, order],
      );
      await pool.query(
        `INSERT INTO "StaffService" ("staffId","serviceId") VALUES ($1,$2)
         ON CONFLICT ("staffId","serviceId") DO NOTHING`,
        [id, SVC],
      );
    }
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM "BookingEvent" WHERE "bookingId" IN (SELECT "id" FROM "Booking" WHERE "businessId"=$1)`, [BIZ]);
    await pool.query(`DELETE FROM "Booking" WHERE "businessId"=$1`, [BIZ]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM "BookingEvent" WHERE "bookingId" IN (SELECT "id" FROM "Booking" WHERE "businessId"=$1)`, [BIZ]);
    await pool.query(`DELETE FROM "Booking" WHERE "businessId"=$1`, [BIZ]);
    await pool.query(`DELETE FROM "StaffService" WHERE "serviceId"=$1`, [SVC]);
    await pool.query(`DELETE FROM "Service" WHERE "id"=$1`, [SVC]);
    await pool.query(`DELETE FROM "Staff" WHERE "businessId"=$1`, [BIZ]);
    await pool.query(`DELETE FROM "Business" WHERE "id"=$1`, [BIZ]);
    await pool.end();
    await repo.close();
  });

  async function confirmedCount(): Promise<number> {
    const r = await pool.query(`SELECT count(*)::int AS n FROM "Booking" WHERE "businessId"=$1 AND status='CONFIRMED'`, [BIZ]);
    return r.rows[0].n as number;
  }

  it("T-C1: 20 parallel confirms, distinct quotes, one staff → exactly 1 booking, 19 SLOT_UNAVAILABLE", async () => {
    const payloads = Array.from({ length: 20 }, () => makePayload(ulid()));
    const results = await Promise.all(payloads.map((p) => repo.createBooking(input(p, [STAFF_A]))));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "conflict")).toHaveLength(19);
    expect(await confirmedCount()).toBe(1);
  });

  it("T-C4: same quote confirmed 10× in parallel → 1 row, one reference, 9 replays", async () => {
    const p = makePayload(ulid());
    const results = await Promise.all(Array.from({ length: 10 }, () => repo.createBooking(input(p, [STAFF_A]))));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "replayed")).toHaveLength(9);
    expect(results.filter((r) => r.kind === "conflict")).toHaveLength(0);
    const refs = new Set(results.map((r) => (r.kind === "conflict" ? "X" : r.booking.reference)));
    expect(refs.size).toBe(1); // all share the one winning reference
    expect(await confirmedCount()).toBe(1);
  });

  it("T-C5a: two resources, 3 parallel confirms for one slot → 2 booked on different staff, 1 rejected", async () => {
    const payloads = Array.from({ length: 3 }, () => makePayload(ulid()));
    const results = await Promise.all(payloads.map((p) => repo.createBooking(input(p, [STAFF_A, STAFF_B]))));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(2);
    expect(results.filter((r) => r.kind === "conflict")).toHaveLength(1);
    const staff = await pool.query(`SELECT DISTINCT "staffId" FROM "Booking" WHERE "businessId"=$1 AND status='CONFIRMED'`, [BIZ]);
    expect(staff.rows.map((r) => r.staffId as string).sort()).toEqual([STAFF_A, STAFF_B]);
  });

  it("T-C5b: first resource busy → savepoint rollback → booked on the second", async () => {
    await repo.createBooking(input(makePayload(ulid()), [STAFF_A])); // occupy A
    const p = makePayload(ulid());
    const res = await repo.createBooking(input(p, [STAFF_A, STAFF_B])); // A busy → must land on B
    expect(res.kind).toBe("created");
    const row = await pool.query(`SELECT "staffId" FROM "Booking" WHERE "quoteId"=$1`, [p.quote_id]);
    expect(row.rows[0].staffId).toBe(STAFF_B);
  });

  it("CONTROL: naive catch-and-continue WITHOUT a savepoint fails the next insert with 25P02", async () => {
    // occupy A so the first insert conflicts
    await repo.createBooking(input(makePayload(ulid()), [STAFF_A]));
    const client = await pool.connect();
    let secondErrorCode: string | undefined;
    try {
      await client.query("BEGIN");
      try {
        await client.query(INSERT_SQL, insertValues(STAFF_A, ulid(), generateReference() + "-a"));
      } catch {
        // naive: swallow and continue WITHOUT rolling back to a savepoint
      }
      try {
        await client.query(INSERT_SQL, insertValues(STAFF_B, ulid(), generateReference() + "-b"));
      } catch (err) {
        secondErrorCode = (err as { code?: string }).code;
      }
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    // 25P02 = current transaction is aborted — this is why the real path uses SAVEPOINTs.
    expect(secondErrorCode).toBe("25P02");
  });
});
