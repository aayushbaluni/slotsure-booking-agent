import { DateTime } from "luxon";
import { ulid } from "ulid";
import type {
  BookingPort,
  RequestContext,
  ClockPort,
  RepositoryPort,
  TokenSignerPort,
  CodeDeriverPort,
  EventSinkPort,
  CalendarPort,
  NotifierPort,
  FaultPort,
  RateLimiterPort,
  QuotePayload,
  ServiceData,
  BusinessData,
  OccupiedRange,
} from "@slotsure/shared/ports";
import {
  SlotSureError,
  type FindAvailabilityIn,
  type QuoteIn,
  type ConfirmIn,
  type ManageIn,
  type CancelIn,
  type CoreResult,
  type BusinessInfo,
  type ListServicesOut,
  type FindAvailabilityOut,
  type QuoteOut,
  type ConfirmOut,
  type CancelOut,
  type BookingSummary,
  type AlternativeSlot,
} from "@slotsure/shared";
import { resolveDate } from "./dates.js";
import { matchService } from "./matcher.js";
import { windowsForWeekday, generateCandidates } from "./slots.js";
import { filterFree, isStartFree } from "./availability.js";
import { displayLocal, isoWithOffset, parseIso } from "./format.js";
import { generateReference } from "./reference.js";

const QUOTE_TTL_MINS = 10;
const REPLAY_WINDOW_DAYS = 7;
const DEMO_CAPACITY = 200;

export interface CoreDeps {
  clock: ClockPort;
  repository: RepositoryPort;
  tokenSigner: TokenSignerPort;
  codeDeriver: CodeDeriverPort;
  events: EventSinkPort;
  calendar: CalendarPort;
  notifier: NotifierPort;
  faults: FaultPort;
  limiter: RateLimiterPort;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const LATENCY_FAULT_MS = 10_000; // trips the platform timeout (build spec §8)

export class BookingCore implements BookingPort {
  constructor(private readonly deps: CoreDeps) {}

  // ---------------------------------------------------------------- reads

  async getBusinessInfo(): Promise<CoreResult<BusinessInfo>> {
    const [biz, hours, closures] = await Promise.all([
      this.deps.repository.getBusiness(),
      this.deps.repository.getOpeningHours(),
      this.deps.repository.getClosures(),
    ]);
    const byWeekday = new Map<number, string[]>();
    for (const h of hours) {
      const list = byWeekday.get(h.weekday) ?? [];
      list.push(`${h.opensAt}–${h.closesAt}`);
      byWeekday.set(h.weekday, list);
    }
    const data: BusinessInfo = {
      name: biz.name,
      timezone: biz.timezone,
      capabilities: biz.capabilities,
      callHours: [...byWeekday.entries()].sort((a, b) => a[0] - b[0]).map(([weekday, windows]) => ({ weekday, windows })),
      closures: closures.map((c) => ({ date: c.date, reason: c.reason })),
      bookingRules: {
        minLeadMins: biz.minLeadMins,
        maxDaysAhead: biz.maxDaysAhead,
        slotStepMins: biz.slotStepMins,
        cancelCutoffMins: biz.cancelCutoffMins,
      },
      business_now: this.nowIso(biz),
    };
    return this.ok(biz, data, "Here's what Ayush offers and when he's available for demo calls.");
  }

  async listServices(): Promise<CoreResult<ListServicesOut>> {
    const biz = await this.deps.repository.getBusiness();
    const services = await this.deps.repository.getServices({ activeOnly: true });
    const data: ListServicesOut = {
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMins: s.durationMins,
        description: s.description,
      })),
    };
    const say = services.map((s) => `${s.name} (${s.durationMins} min, free)`).join(" and ");
    return this.ok(biz, data, `Ayush offers a ${say}. Which would you like to talk about?`);
  }

  async findAvailability(input: FindAvailabilityIn): Promise<CoreResult<FindAvailabilityOut>> {
    const biz = await this.deps.repository.getBusiness();
    const services = await this.deps.repository.getServices({ activeOnly: true });
    const service = matchService(input.service, services);
    const now = this.now(biz);
    const day = resolveDate(input.date, biz.timezone, this.deps.clock);

    const free = await this.freeStartsForDay(biz, service, day, now);
    let slots = free;
    if (input.part_of_day === "morning") slots = slots.filter((s) => s.hour < 13);
    if (input.part_of_day === "evening") slots = slots.filter((s) => s.hour >= 17);
    if (input.after) {
      const [h, m] = input.after.split(":").map((n) => Number.parseInt(n, 10));
      slots = slots.filter((s) => s.hour > h! || (s.hour === h! && s.minute >= m!));
    }
    const limited = slots.slice(0, input.limit);

    const data: FindAvailabilityOut = {
      service: { id: service.id, name: service.name },
      resolved_date: day.toISODate() ?? "",
      slots: limited.map((s) => this.toSlot(s, biz)),
    };

    let say: string;
    if (limited.length > 0) {
      data.slots = limited.map((s) => this.toSlot(s, biz));
      say = `For a ${service.name} on ${day.toFormat("ccc d LLL")}, I can offer ${limited
        .map((s) => s.toFormat("h:mm a"))
        .join(", ")} IST.`;
    } else {
      const next = await this.nextAvailable(biz, service, day, now);
      if (next) {
        data.next_available = this.toSlot(next, biz);
        say = `Nothing free on ${day.toFormat("ccc d LLL")}. The next opening is ${displayLocal(next, biz.timezone)}.`;
      } else {
        say = `I don't see any free demo-call times for a ${service.name} in the next ${biz.maxDaysAhead} days.`;
      }
    }
    return this.ok(biz, data, say);
  }

  // ---------------------------------------------------------------- quote

  async quote(input: QuoteIn): Promise<CoreResult<QuoteOut>> {
    const biz = await this.deps.repository.getBusiness();
    const services = await this.deps.repository.getServices();
    const service = matchService(input.service, services);
    const now = this.now(biz);
    const start = parseIso(input.start, biz.timezone);
    if (!start.isValid) throw new SlotSureError("VALIDATION_ERROR", "That time didn't look right — could you pick a slot again?", { fields: ["start"] });

    await this.assertBookable(biz, service, start, now);

    const issuedAt = now;
    const payload: QuotePayload = {
      quote_id: ulid(),
      service_id: service.id,
      service_version: service.version,
      generation: biz.resetGeneration,
      start: isoWithOffset(start),
      duration_mins: service.durationMins,
      buffer_mins: service.bufferMins,
      price_paise: service.pricePaise,
      issued_at: isoWithOffset(issuedAt),
      book_by: isoWithOffset(issuedAt.plus({ minutes: QUOTE_TTL_MINS })),
      replay_until: isoWithOffset(issuedAt.plus({ days: REPLAY_WINDOW_DAYS })),
    };
    const token = this.deps.tokenSigner.sign(payload);
    const review = {
      service_name: service.name,
      start: payload.start,
      display: displayLocal(start, biz.timezone),
      duration_mins: service.durationMins,
      price_paise: service.pricePaise,
      is_demo: true as const,
    };
    const say = `${service.name} with Ayush · ${review.display} · ${service.durationMins} min · free · demo. Shall I confirm this demo call?`;
    return this.ok(biz, { quote_token: token, review }, say);
  }

  // ---------------------------------------------------------------- confirm

  async confirm(input: ConfirmIn, ctx: RequestContext): Promise<CoreResult<ConfirmOut>> {
    const biz = await this.deps.repository.getBusiness();
    const payload = this.deps.tokenSigner.verify(input.quote_token); // throws QUOTE_INVALID
    await this.applyPreWriteFault("confirm_booking"); // error_503 (none) / latency

    // Replay path FIRST — before any expiry/version/availability check (build spec §5).
    const existing = await this.deps.repository.findBookingByQuoteId(payload.quote_id);
    if (existing) {
      const code = this.deps.codeDeriver.derive(payload.quote_id).code;
      const data: ConfirmOut = {
        reference: existing.reference,
        manage_code: code,
        replayed: true,
        booking: this.toBookingSummary(existing, biz),
      };
      const say =
        existing.status === "CANCELLED"
          ? "That booking was made and later cancelled."
          : `Booked: ${existing.serviceName} with Ayush, ${this.toBookingSummary(existing, biz).display}. Reference ${existing.reference}, manage code ${code}.`;
      return this.ok(biz, data, say);
    }

    // New booking path.
    if (!input.customer_confirmed)
      throw new SlotSureError("CONFIRMATION_REQUIRED", "Shall I confirm this demo call? Just say yes.");
    if (payload.generation !== biz.resetGeneration)
      throw new SlotSureError("QUOTE_INVALID", "That quote expired when the demo reset. Let's find a time again.");
    if (this.now(biz) > parseIso(payload.book_by, biz.timezone))
      throw new SlotSureError("QUOTE_EXPIRED", "That quote timed out. Shall I re-check the same time?");

    const service = (await this.deps.repository.getServices()).find((s) => s.id === payload.service_id);
    if (!service || !service.active || service.version !== payload.service_version)
      throw new SlotSureError("QUOTE_STALE", "That service changed since the quote. Let me show you the current details.");

    const start = parseIso(payload.start, biz.timezone);
    const now = this.now(biz);
    if (start < now) throw new SlotSureError("DATE_IN_PAST", "That time has already passed. Shall I find the next opening?");
    if (start < now.plus({ minutes: biz.minLeadMins }))
      throw new SlotSureError("TOO_SOON", `Ayush needs at least ${biz.minLeadMins} minutes' notice. Shall I offer the next slot?`);

    if ((await this.deps.repository.countActiveBookings()) >= DEMO_CAPACITY)
      throw new SlotSureError("DEMO_CAPACITY_REACHED", "The demo is full right now; it clears at the nightly reset.");

    const staff = await this.deps.repository.getEligibleStaff(service.id);
    const { code, hash } = this.deps.codeDeriver.derive(payload.quote_id);
    const reference = generateReference();

    const result = await this.deps.repository.createBooking({
      businessId: biz.id,
      payload,
      serviceName: service.name,
      manageCodeHash: hash,
      reference,
      customerName: input.customer_name,
      projectType: input.project_type,
      projectBrief: input.project_brief,
      timeline: input.timeline,
      eligibleStaffIds: staff.map((s) => s.id),
      requestId: ctx.requestId,
    });

    if (result.kind === "conflict") {
      await this.deps.events.emit({ type: "conflict_rejected", requestId: ctx.requestId, detail: { start: payload.start } });
      const alts = await this.nearestAlternatives(biz, service, start, now);
      throw new SlotSureError(
        "SLOT_UNAVAILABLE",
        `Sorry, that time was just taken. Nothing was booked. The nearest free times are ${alts.map((a) => a.display).join(", ")}.`,
        { alternatives: alts },
      );
    }

    const booking = result.booking;
    const replayed = result.kind === "replayed";
    if (!replayed) {
      // fail_after_commit: the booking IS written, but the client gets write_state "unknown".
      // The next retry with the same quote hits the replay path and returns this booking (T-R1).
      if (this.deps.faults.current("confirm_booking") === "fail_after_commit")
        throw new SlotSureError("INTERNAL", "I couldn't verify whether that completed.", {}, "unknown");
      // created-event is written atomically inside the transaction; side-effects happen after.
      await this.deps.calendar.onBooked(booking);
      await this.deps.notifier.bookingConfirmed(booking);
    }
    const data: ConfirmOut = {
      reference: booking.reference,
      manage_code: code,
      replayed,
      booking: this.toBookingSummary(booking, biz),
    };
    return this.ok(
      biz,
      data,
      `Booked: ${booking.serviceName} with Ayush, ${data.booking.display}. Reference ${booking.reference}, manage code ${code}.`,
    );
  }

  // ---------------------------------------------------------------- lookup / cancel

  async getBooking(input: ManageIn, ctx: RequestContext): Promise<CoreResult<BookingSummary>> {
    const biz = await this.deps.repository.getBusiness();
    const booking = await this.verifyAccess(input.reference, input.manage_code, ctx);
    return this.ok(biz, this.toBookingSummary(booking, biz), this.lookupSay(booking, biz));
  }

  async cancel(input: CancelIn, ctx: RequestContext): Promise<CoreResult<CancelOut>> {
    const biz = await this.deps.repository.getBusiness();
    if (!input.customer_confirmed)
      throw new SlotSureError("CONFIRMATION_REQUIRED", "Shall I cancel this demo booking? Say yes to confirm.");
    const booking = await this.verifyAccess(input.reference, input.manage_code, ctx);
    await this.applyPreWriteFault("cancel_booking");

    const now = this.now(biz);
    if (now >= DateTime.fromJSDate(booking.startsAt)) throw new SlotSureError("BOOKING_IN_PAST", "That call time has already passed.");
    if (now > DateTime.fromJSDate(booking.startsAt).minus({ minutes: biz.cancelCutoffMins }))
      throw new SlotSureError("CANCELLATION_WINDOW_CLOSED", `Cancellations close ${biz.cancelCutoffMins / 60} h before the call, so this demo call simply stands.`);

    const res = await this.deps.repository.cancelBooking(booking.reference);
    if (this.deps.faults.current("cancel_booking") === "fail_after_commit")
      throw new SlotSureError("INTERNAL", "I couldn't verify whether that completed.", {}, "unknown");
    if (!res.alreadyCancelled) {
      await this.deps.events.emit({ type: "cancelled", requestId: ctx.requestId, bookingId: booking.id, detail: {} });
      await this.deps.calendar.onCancelled(booking);
      await this.deps.notifier.bookingCancelled(booking);
    }
    const data: CancelOut = { reference: booking.reference, status: "CANCELLED", already_cancelled: res.alreadyCancelled };
    const say = res.alreadyCancelled ? "That booking was already cancelled — nothing further to do." : "Done — that demo call is cancelled and the slot is free again.";
    return this.ok(biz, data, say);
  }

  // ---------------------------------------------------------------- helpers

  private async verifyAccess(reference: string, code: string, ctx: RequestContext) {
    // Throttle (never lock): after 5 failures/hour for a reference, allow at most 1 attempt/min,
    // so a real client can always get in after the wait (build spec §8, S2).
    if (await this.deps.limiter.isCodeThrottled(reference))
      throw new SlotSureError("RATE_LIMITED", "Too many attempts just now — please wait a minute and try again.");

    const booking = await this.deps.repository.findBookingByReference(reference);
    if (!booking || !this.deps.codeDeriver.matches(code, booking.manageCodeHash)) {
      await this.deps.limiter.recordCodeFailure(reference, ctx.clientKey);
      await this.deps.events.emit({ type: "lookup_denied", requestId: ctx.requestId, detail: { reference } });
      // identical error for wrong code and unknown reference, so references can't be probed.
      throw new SlotSureError("BOOKING_NOT_FOUND", "I couldn't find a booking with that reference and code. Could you check both?");
    }
    return booking;
  }

  /** Pre-write fault injection (demo/tests). error_503 = known failure (write_state none);
   *  latency = sleep to trip the platform timeout. fail_after_commit is applied post-write. */
  private async applyPreWriteFault(tool: string): Promise<void> {
    const mode = this.deps.faults.current(tool);
    if (mode === "error_503")
      throw new SlotSureError("UNAVAILABLE", "That didn't go through — nothing was booked. Shall I try again?");
    if (mode === "latency") await sleep(LATENCY_FAULT_MS);
  }

  /** Re-checks every placement rule for an exact start (used by quote and confirm). */
  private async assertBookable(biz: BusinessData, service: ServiceData, start: DateTime, now: DateTime): Promise<void> {
    if (start < now) throw new SlotSureError("DATE_IN_PAST", "That time has already passed. Shall I find the next opening?");
    if (start < now.plus({ minutes: biz.minLeadMins }))
      throw new SlotSureError("TOO_SOON", `Ayush needs at least ${biz.minLeadMins} minutes' notice. Shall I offer the next slot?`);
    if (start > now.plus({ days: biz.maxDaysAhead }))
      throw new SlotSureError("OUTSIDE_BOOKING_WINDOW", `Demo calls can be booked up to ${biz.maxDaysAhead} days ahead.`);

    const closures = await this.deps.repository.getClosures();
    const isoDate = start.toISODate();
    if (closures.some((c) => c.date === isoDate))
      throw new SlotSureError("CLOSED", "Ayush is closed that day. Shall I find the next open time?");

    const hours = await this.deps.repository.getOpeningHours();
    const windows = windowsForWeekday(hours, start.weekday);
    const candidates = generateCandidates(start.startOf("day"), windows, {
      stepMins: biz.slotStepMins,
      durationMins: service.durationMins,
      bufferMins: service.bufferMins,
    });
    const onGrid = candidates.some((c) => c.toMillis() === start.toMillis());
    if (!onGrid) {
      if (windows.length === 0) throw new SlotSureError("OUTSIDE_OPENING_HOURS", "That's outside Ayush's call hours.");
      throw new SlotSureError("SLOT_UNAVAILABLE", "That exact time isn't on the schedule. Shall I show the nearest openings?");
    }

    const staff = await this.deps.repository.getEligibleStaff(service.id);
    const occupied = await this.occupiedForDay(staff.map((s) => s.id), start.startOf("day"), biz);
    const blockMins = service.durationMins + service.bufferMins;
    if (!isStartFree(start, blockMins, staff.map((s) => s.id), occupied))
      throw new SlotSureError("SLOT_UNAVAILABLE", "That time was just taken. Shall I show the nearest openings?");
  }

  private async freeStartsForDay(biz: BusinessData, service: ServiceData, day: DateTime, now: DateTime): Promise<DateTime[]> {
    const closures = await this.deps.repository.getClosures();
    if (closures.some((c) => c.date === day.toISODate())) return [];
    if (day.startOf("day") > now.plus({ days: biz.maxDaysAhead })) return [];

    const hours = await this.deps.repository.getOpeningHours();
    const windows = windowsForWeekday(hours, day.weekday);
    const candidates = generateCandidates(day.startOf("day"), windows, {
      stepMins: biz.slotStepMins,
      durationMins: service.durationMins,
      bufferMins: service.bufferMins,
    }).filter((c) => c >= now.plus({ minutes: biz.minLeadMins }) && c <= now.plus({ days: biz.maxDaysAhead }));

    const staff = await this.deps.repository.getEligibleStaff(service.id);
    const occupied = await this.occupiedForDay(staff.map((s) => s.id), day.startOf("day"), biz);
    return filterFree(candidates, service.durationMins + service.bufferMins, staff.map((s) => s.id), occupied);
  }

  private async nextAvailable(biz: BusinessData, service: ServiceData, fromDay: DateTime, now: DateTime): Promise<DateTime | null> {
    for (let i = 1; i <= biz.maxDaysAhead; i++) {
      const day = fromDay.plus({ days: i });
      const free = await this.freeStartsForDay(biz, service, day, now);
      if (free.length > 0) return free[0]!;
    }
    return null;
  }

  private async nearestAlternatives(biz: BusinessData, service: ServiceData, around: DateTime, now: DateTime): Promise<AlternativeSlot[]> {
    const out: AlternativeSlot[] = [];
    for (let i = 0; i <= biz.maxDaysAhead && out.length < 3; i++) {
      const day = around.plus({ days: i }).startOf("day");
      const free = (await this.freeStartsForDay(biz, service, day, now)).filter((s) => i > 0 || s > around);
      for (const s of free) {
        if (out.length >= 3) break;
        out.push(this.toSlot(s, biz));
      }
    }
    return out;
  }

  private async occupiedForDay(staffIds: string[], day: DateTime, biz: BusinessData): Promise<OccupiedRange[]> {
    const from = day.startOf("day").toUTC().toJSDate();
    const to = day.plus({ days: 1 }).startOf("day").toUTC().toJSDate();
    return this.deps.repository.getOccupiedRanges(staffIds, from, to);
  }

  private now(biz: BusinessData): DateTime {
    return DateTime.fromJSDate(this.deps.clock.now(), { zone: biz.timezone });
  }
  private nowIso(biz: BusinessData): string {
    return isoWithOffset(this.now(biz));
  }
  private ok<T>(biz: BusinessData, data: T, say: string): CoreResult<T> {
    return { data, say, business_now: this.nowIso(biz) };
  }
  private toSlot(dt: DateTime, biz: BusinessData) {
    return { start: isoWithOffset(dt), display: displayLocal(dt, biz.timezone) };
  }
  private toBookingSummary(b: { reference: string; serviceName: string; startsAt: Date; durationMins: number; status: "CONFIRMED" | "CANCELLED" }, biz: BusinessData): BookingSummary {
    const start = DateTime.fromJSDate(b.startsAt, { zone: biz.timezone });
    return {
      reference: b.reference,
      service_name: b.serviceName,
      start: isoWithOffset(start),
      display: displayLocal(start, biz.timezone),
      duration_mins: b.durationMins,
      status: b.status,
      is_demo: true,
    };
  }
  private lookupSay(b: { serviceName: string; startsAt: Date; durationMins: number; status: "CONFIRMED" | "CANCELLED" }, biz: BusinessData): string {
    const s = this.toBookingSummary({ ...b, reference: "" }, biz);
    return b.status === "CANCELLED"
      ? `That ${b.serviceName} for ${s.display} was cancelled.`
      : `That's a ${b.serviceName} with Ayush, ${s.display} — currently confirmed.`;
  }
}
