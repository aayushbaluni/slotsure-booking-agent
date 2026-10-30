import { Pool } from "pg";
import { ulid } from "ulid";
import type { PrismaClient } from "@prisma/client";
import type {
  BookingRecord,
  BusinessData,
  ClosureData,
  CreateBookingInput,
  CreateBookingResult,
  DomainEvent,
  OccupiedRange,
  OpeningHoursData,
  RepositoryPort,
  ServiceData,
  StaffData,
} from "@slotsure/shared/ports";
import type { BookingStatus } from "@slotsure/shared";
import { createPrisma, PG_SESSION_OPTIONS } from "./prisma.js";
import { isExclusionViolation, isUniqueViolation } from "./errors.js";

/**
 * The only adapter that touches Postgres. Reads go through Prisma; the write path uses a raw pg
 * client so it can drive explicit SAVEPOINT / RELEASE / ROLLBACK TO per eligible staff — the
 * strategy proven in test/db/race.test.mjs (build spec §3). The exclusion constraint is the
 * arbiter of overlaps; this code only reacts to 23P01 / 23505.
 */
export class PrismaPgRepository implements RepositoryPort {
  private constructor(
    private readonly prisma: PrismaClient,
    private readonly pool: Pool,
  ) {}

  static create(databaseUrl: string): PrismaPgRepository {
    // the write-path pool carries the same statement timeout as the Prisma (read) adapter
    const pool = new Pool({ connectionString: databaseUrl, options: PG_SESSION_OPTIONS });
    return new PrismaPgRepository(createPrisma(databaseUrl), pool);
  }

  /** Release the connection pool and Prisma client (used by tests and graceful shutdown). */
  async close(): Promise<void> {
    await this.pool.end();
    await this.prisma.$disconnect();
  }

  // ---- reads ----

  async getBusiness(): Promise<BusinessData> {
    const b = await this.prisma.business.findFirstOrThrow();
    return {
      id: b.id,
      name: b.name,
      timezone: b.timezone,
      currency: b.currency,
      capabilities: b.capabilities,
      minLeadMins: b.minLeadMins,
      maxDaysAhead: b.maxDaysAhead,
      slotStepMins: b.slotStepMins,
      cancelCutoffMins: b.cancelCutoffMins,
      resetGeneration: b.resetGeneration,
    };
  }

  async getServices(opts?: { activeOnly?: boolean }): Promise<ServiceData[]> {
    const rows = await this.prisma.service.findMany({
      where: opts?.activeOnly ? { active: true } : undefined,
      orderBy: { durationMins: "asc" },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      aliases: s.aliases,
      durationMins: s.durationMins,
      bufferMins: s.bufferMins,
      pricePaise: s.pricePaise,
      active: s.active,
      version: s.version,
    }));
  }

  async getOpeningHours(): Promise<OpeningHoursData[]> {
    const rows = await this.prisma.openingHours.findMany();
    return rows.map((h) => ({ weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt }));
  }

  async getClosures(): Promise<ClosureData[]> {
    const rows = await this.prisma.closure.findMany();
    return rows.map((c) => ({ date: c.date, reason: c.reason }));
  }

  async getEligibleStaff(serviceId: string): Promise<StaffData[]> {
    const rows = await this.prisma.staff.findMany({
      where: { services: { some: { serviceId } } },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map((s) => ({ id: s.id, displayName: s.displayName, sortOrder: s.sortOrder }));
  }

  async getOccupiedRanges(staffIds: string[], fromUtc: Date, toUtc: Date): Promise<OccupiedRange[]> {
    if (staffIds.length === 0) return [];
    const rows = await this.prisma.booking.findMany({
      where: {
        staffId: { in: staffIds },
        status: "CONFIRMED",
        blockedUntil: { gt: fromUtc },
        startsAt: { lt: toUtc },
      },
      select: { staffId: true, startsAt: true, blockedUntil: true },
    });
    return rows.map((r) => ({ staffId: r.staffId, startsAt: r.startsAt, blockedUntil: r.blockedUntil }));
  }

  async findBookingByQuoteId(quoteId: string): Promise<BookingRecord | null> {
    const row = await this.prisma.booking.findUnique({ where: { quoteId } });
    return row ? toRecord(row) : null;
  }

  async findBookingByReference(reference: string): Promise<BookingRecord | null> {
    const row = await this.prisma.booking.findUnique({ where: { reference } });
    return row ? toRecord(row) : null;
  }

  // ---- race-safe write path (raw pg + savepoints) ----

  async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    const { payload } = input;
    const startsAt = new Date(payload.start);
    const endsAt = new Date(startsAt.getTime() + payload.duration_mins * 60_000);
    const blockedUntil = new Date(endsAt.getTime() + payload.buffer_mins * 60_000);

    const client = await this.pool.connect();
    let txOpen = false;
    try {
      await client.query("BEGIN");
      txOpen = true;
      for (const staffId of input.eligibleStaffIds) {
        await client.query("SAVEPOINT try_staff");
        try {
          const id = `bk_${ulid()}`;
          const res = await client.query(
            `INSERT INTO "Booking" (
               "id","businessId","reference","manageCodeHash","quoteId","serviceId","staffId",
               "startsAt","endsAt","blockedUntil","serviceName","durationMins","bufferMins",
               "pricePaise","serviceVersion","generation","customerName","projectType","timeline",
               "projectBrief","status","isDemo","createdAt"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'CONFIRMED',true,now())
             RETURNING "id","reference","quoteId","status","serviceName","startsAt","endsAt","durationMins","manageCodeHash"`,
            [
              id,
              input.businessId,
              input.reference,
              input.manageCodeHash,
              payload.quote_id,
              payload.service_id,
              staffId,
              startsAt,
              endsAt,
              blockedUntil,
              input.serviceName,
              payload.duration_mins,
              payload.buffer_mins,
              payload.price_paise,
              payload.service_version,
              payload.generation,
              input.customerName,
              input.projectType,
              input.timeline ?? null,
              input.projectBrief,
            ],
          );
          await client.query("RELEASE SAVEPOINT try_staff");
          // created-event, atomic with the booking (detail never carries name, brief or code)
          await client.query(
            `INSERT INTO "BookingEvent" ("id","bookingId","type","requestId","detail","createdAt")
             VALUES ($1,$2,'created',$3,$4,now())`,
            [`ev_${ulid()}`, id, input.requestId, JSON.stringify({ staffId })],
          );
          await client.query("COMMIT");
          txOpen = false;
          return { kind: "created", booking: rowToRecord(res.rows[0]) };
        } catch (err) {
          if (isExclusionViolation(err)) {
            // this staff is busy for the range — undo just this attempt and try the next.
            // Without the SAVEPOINT the transaction would be aborted (25P02); see race.test.ts.
            await client.query("ROLLBACK TO SAVEPOINT try_staff");
            continue;
          }
          if (isUniqueViolation(err)) {
            // a concurrent call with the same quote already won — resolve as replay after the tx.
            break;
          }
          throw err; // unexpected — the finally block rolls back the aborted tx before releasing.
        }
      }
      await client.query("ROLLBACK");
      txOpen = false;
      // No insert committed. Before declaring a conflict, check whether a concurrent call with the
      // SAME quote won: Postgres may raise 23P01 (exclusion) before 23505 (unique quoteId) for a
      // same-quote race, so this re-read makes a parallel double-confirm (T-C4) replay, not fail.
      const sameQuote = await this.findBookingByQuoteId(payload.quote_id);
      return sameQuote ? { kind: "replayed", booking: sameQuote } : { kind: "conflict" };
    } finally {
      // Never return a connection to the pool mid-transaction: a poisoned (aborted) tx would make
      // the next caller's BEGIN fail with "current transaction is aborted".
      if (txOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* connection already unusable; releasing with an error destroys it */
        }
      }
      client.release();
    }
  }

  async cancelBooking(reference: string): Promise<{ status: BookingStatus; alreadyCancelled: boolean }> {
    const res = await this.prisma.booking.updateMany({
      where: { reference, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return { status: "CANCELLED", alreadyCancelled: res.count === 0 };
  }

  async countActiveBookings(): Promise<number> {
    return this.prisma.booking.count({ where: { status: "CONFIRMED" } });
  }

  async currentGeneration(): Promise<number> {
    const biz = await this.prisma.business.findFirstOrThrow({ select: { resetGeneration: true } });
    return biz.resetGeneration;
  }

  async resetDemo(): Promise<{ generation: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.bookingEvent.deleteMany({});
      await tx.booking.deleteMany({});
      const biz = await tx.business.findFirstOrThrow({ select: { id: true } });
      const updated = await tx.business.update({
        where: { id: biz.id },
        data: { resetGeneration: { increment: 1 } },
        select: { resetGeneration: true },
      });
      return { generation: updated.resetGeneration };
    });
  }

  async listBookings(): Promise<import("@slotsure/shared/ports").AdminBookingRow[]> {
    const rows = await this.prisma.booking.findMany({ orderBy: { startsAt: "asc" } });
    return rows.map((r) => ({
      reference: r.reference,
      serviceName: r.serviceName,
      staffId: r.staffId,
      startsAt: r.startsAt,
      status: r.status,
      projectType: r.projectType,
      createdAt: r.createdAt,
    }));
  }

  async listEvents(limit: number): Promise<import("@slotsure/shared/ports").AdminEventRow[]> {
    const rows = await this.prisma.bookingEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((r) => ({ type: r.type, requestId: r.requestId, detail: r.detail, createdAt: r.createdAt }));
  }

  async writeEvent(event: DomainEvent): Promise<void> {
    await this.prisma.bookingEvent.create({
      data: {
        type: event.type,
        requestId: event.requestId,
        bookingId: event.bookingId ?? null,
        detail: event.detail as object,
      },
    });
  }
}

interface BookingRow {
  id: string;
  reference: string;
  quoteId: string;
  status: BookingStatus;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  durationMins: number;
  manageCodeHash: string;
}

function toRecord(row: BookingRow): BookingRecord {
  return rowToRecord(row);
}
function rowToRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    reference: row.reference,
    quoteId: row.quoteId,
    status: row.status,
    serviceName: row.serviceName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    durationMins: row.durationMins,
    manageCodeHash: row.manageCodeHash,
  };
}
