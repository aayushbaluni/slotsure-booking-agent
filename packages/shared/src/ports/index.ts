/**
 * Ports — the only things the core is allowed to depend on.
 *
 * Driving port  (BookingPort): how the world calls the core. REST / MCP / future agent
 *   platforms are driving ADAPTERS that call this.
 * Driven ports (everything else): what the core needs from the world. Each has a concrete
 *   ADAPTER wired at the composition root. A new integration = a new adapter behind one of
 *   these, with zero core changes.
 *
 * Rule: this file imports nothing from apps/*. Adapters depend on ports, never the reverse.
 */
import type {
  BusinessInfo,
  ListServicesOut,
  FindAvailabilityIn,
  FindAvailabilityOut,
  QuoteIn,
  QuoteOut,
  ConfirmIn,
  ConfirmOut,
  ManageIn,
  CancelIn,
  CancelOut,
  BookingStatus,
  BookingSummary,
} from "../schemas/index.js";
import type { CoreResult } from "../envelope.js";

// ============================================================================
// Driving port — the application API behind every inbound adapter
// ============================================================================
export interface BookingPort {
  getBusinessInfo(): Promise<CoreResult<BusinessInfo>>;
  listServices(): Promise<CoreResult<ListServicesOut>>;
  findAvailability(input: FindAvailabilityIn): Promise<CoreResult<FindAvailabilityOut>>;
  quote(input: QuoteIn): Promise<CoreResult<QuoteOut>>;
  confirm(input: ConfirmIn, ctx: RequestContext): Promise<CoreResult<ConfirmOut>>;
  getBooking(input: ManageIn, ctx: RequestContext): Promise<CoreResult<BookingSummary>>;
  cancel(input: CancelIn, ctx: RequestContext): Promise<CoreResult<CancelOut>>;
}

export interface RequestContext {
  requestId: string;
  clientKey: string; // hashed IP or platform session id (for throttling)
}

// ============================================================================
// Driven ports
// ============================================================================

/** Single source of "now". SystemClock in prod, FrozenClock in tests. */
export interface ClockPort {
  now(): Date;
}

/** Signs & verifies quote tokens. HMAC today; KMS/versioned-keys later — same interface. */
export interface QuotePayload {
  quote_id: string;
  service_id: string;
  service_version: number;
  generation: number;
  start: string;
  duration_mins: number;
  buffer_mins: number;
  price_paise: number;
  issued_at: string;
  book_by: string;
  replay_until: string;
}
export interface TokenSignerPort {
  sign(payload: QuotePayload): string;
  /** throws SlotSureError("QUOTE_INVALID") on a bad/tampered signature. */
  verify(token: string): QuotePayload;
}

/** Derives & verifies the customer-facing manage code from a quote id. */
export interface CodeDeriverPort {
  derive(quoteId: string): { code: string; hash: string };
  matches(input: string, hash: string): boolean;
}

/** Persistence + the race-safe write path. The ONLY port that touches a database. */
export interface BookingRecord {
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
export interface CreateBookingInput {
  businessId: string;
  payload: QuotePayload;
  serviceName: string; // snapshot copied onto the booking row
  manageCodeHash: string;
  reference: string;
  customerName: string;
  projectType: string;
  projectBrief: string;
  timeline?: string;
  eligibleStaffIds: string[]; // tried in order; savepoint per attempt
  requestId: string; // stamped on the booking_events row
}
export type CreateBookingResult =
  | { kind: "created"; booking: BookingRecord }
  | { kind: "replayed"; booking: BookingRecord } // concurrent same-quote winner (23505)
  | { kind: "conflict" }; // all staff overlapped (23P01)
// ---- domain read shapes (the profile the core reasons about) ----
export interface BusinessData {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  capabilities: string[];
  minLeadMins: number;
  maxDaysAhead: number;
  slotStepMins: number;
  cancelCutoffMins: number;
  resetGeneration: number;
}
export interface ServiceData {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  durationMins: number;
  bufferMins: number;
  pricePaise: number;
  active: boolean;
  version: number;
}
export interface StaffData {
  id: string;
  displayName: string;
  sortOrder: number;
}
export interface OpeningHoursData {
  weekday: number; // ISO 1=Mon … 7=Sun
  opensAt: string; // "18:00" local
  closesAt: string; // "21:00" local
}
export interface ClosureData {
  date: string; // "2026-11-01" local
  reason: string;
}
/** A confirmed booking's occupied range, for availability checks. */
export interface OccupiedRange {
  staffId: string;
  startsAt: Date;
  blockedUntil: Date;
}

export interface RepositoryPort {
  // reads — the business profile & current state
  getBusiness(): Promise<BusinessData>;
  getServices(opts?: { activeOnly?: boolean }): Promise<ServiceData[]>;
  getOpeningHours(): Promise<OpeningHoursData[]>;
  getClosures(): Promise<ClosureData[]>;
  /** staff eligible for a service, sorted by sortOrder (one in production: Ayush). */
  getEligibleStaff(serviceId: string): Promise<StaffData[]>;
  /** confirmed bookings for the given staff whose range intersects [fromUtc, toUtc). */
  getOccupiedRanges(staffIds: string[], fromUtc: Date, toUtc: Date): Promise<OccupiedRange[]>;

  // bookings
  findBookingByQuoteId(quoteId: string): Promise<BookingRecord | null>;
  findBookingByReference(reference: string): Promise<BookingRecord | null>;
  /** Opens one tx; savepoint-per-staff insert; maps 23P01/23505; never continues a failed tx. */
  createBooking(input: CreateBookingInput): Promise<CreateBookingResult>;
  /** UPDATE ... WHERE status='CONFIRMED'; 0 rows → already cancelled. */
  cancelBooking(reference: string): Promise<{ status: BookingStatus; alreadyCancelled: boolean }>;
  countActiveBookings(): Promise<number>;
  currentGeneration(): Promise<number>;
  /** One tx: delete events + bookings, bump resetGeneration. Pre-reset quotes can no longer book. */
  resetDemo(): Promise<{ generation: number }>;

  // admin/dashboard reads (never exposed to the agent)
  listBookings(): Promise<AdminBookingRow[]>;
  listEvents(limit: number): Promise<AdminEventRow[]>;
}

export interface AdminBookingRow {
  reference: string;
  serviceName: string;
  staffId: string;
  startsAt: Date;
  status: BookingStatus;
  projectType: string;
  createdAt: Date;
}
export interface AdminEventRow {
  type: string;
  requestId: string;
  detail: unknown;
  createdAt: Date;
}

/** Audit/domain events. DB today; webhook/bus later. */
export interface DomainEvent {
  type:
    | "created"
    | "replayed"
    | "conflict_rejected"
    | "cancelled"
    | "cancel_replayed"
    | "lookup_denied";
  requestId: string;
  bookingId?: string;
  detail: Record<string, unknown>; // never name, brief or code
}
export interface EventSinkPort {
  emit(event: DomainEvent): Promise<void>;
}

/** Reflect a booking on a real calendar. Demo = NoopCalendar (does nothing). */
export interface CalendarPort {
  readonly name: string;
  onBooked(b: BookingRecord): Promise<void>;
  onCancelled(b: BookingRecord): Promise<void>;
}

/** Confirmation/cancellation notifications. Demo = NoopNotifier (sends nothing). */
export interface NotifierPort {
  readonly name: string;
  bookingConfirmed(b: BookingRecord): Promise<void>;
  bookingCancelled(b: BookingRecord): Promise<void>;
}

/** Throttle reads/writes and manage-code guesses. In-memory today; Redis for multi-instance. */
export interface RateLimiterPort {
  take(bucket: string, key: string): Promise<{ allowed: boolean; retryAfterMs?: number }>;
  recordCodeFailure(reference: string, clientKey: string): Promise<void>;
  isCodeThrottled(reference: string): Promise<boolean>;
}

/** Fault injection for the demo/tests. No-op in prod. */
export type FaultMode = "none" | "latency" | "error_503" | "fail_after_commit";
export interface FaultPort {
  current(tool: string): FaultMode;
  set(mode: FaultMode, tools: string[], ttlS: number): void;
}
