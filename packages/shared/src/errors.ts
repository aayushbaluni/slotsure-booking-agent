import { z } from "zod";

/**
 * The error catalogue (build spec §5). One code per failure mode; HTTP status,
 * retryability and write_state are properties of the code, defined once here.
 *
 * write_state is the honesty primitive:
 *   "none"    — the server knows nothing was written (raised before the tx, or after a
 *               rollback the server performed itself). Agent says "didn't go through".
 *   "unknown" — a write may have committed (raised after a possible commit, or a transport
 *               timeout with no envelope). Agent says "couldn't verify" and retries once.
 */
export type WriteState = "none" | "unknown";

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "SERVICE_NOT_FOUND",
  "SERVICE_AMBIGUOUS",
  "SERVICE_INACTIVE",
  "DATE_UNRESOLVABLE",
  "DATE_IN_PAST",
  "TOO_SOON",
  "OUTSIDE_BOOKING_WINDOW",
  "CLOSED",
  "OUTSIDE_OPENING_HOURS",
  "SLOT_UNAVAILABLE",
  "QUOTE_EXPIRED",
  "QUOTE_INVALID",
  "QUOTE_STALE",
  "CONFIRMATION_REQUIRED",
  "BOOKING_NOT_FOUND",
  "CANCELLATION_WINDOW_CLOSED",
  "BOOKING_IN_PAST",
  "DEMO_CAPACITY_REACHED",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL",
  "UNAVAILABLE",
] as const;

export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export interface ErrorMeta {
  http: number;
  retryable: boolean;
  /** default write_state for the code; a handler may still set "unknown" at runtime. */
  writeState: WriteState;
}

export const ERROR_META: Record<ErrorCode, ErrorMeta> = {
  VALIDATION_ERROR: { http: 400, retryable: false, writeState: "none" },
  SERVICE_NOT_FOUND: { http: 404, retryable: false, writeState: "none" },
  SERVICE_AMBIGUOUS: { http: 409, retryable: false, writeState: "none" },
  SERVICE_INACTIVE: { http: 409, retryable: false, writeState: "none" },
  DATE_UNRESOLVABLE: { http: 400, retryable: false, writeState: "none" },
  DATE_IN_PAST: { http: 400, retryable: false, writeState: "none" },
  TOO_SOON: { http: 409, retryable: false, writeState: "none" },
  OUTSIDE_BOOKING_WINDOW: { http: 409, retryable: false, writeState: "none" },
  CLOSED: { http: 409, retryable: false, writeState: "none" },
  OUTSIDE_OPENING_HOURS: { http: 409, retryable: false, writeState: "none" },
  SLOT_UNAVAILABLE: { http: 409, retryable: false, writeState: "none" },
  QUOTE_EXPIRED: { http: 410, retryable: false, writeState: "none" },
  QUOTE_INVALID: { http: 400, retryable: false, writeState: "none" },
  QUOTE_STALE: { http: 409, retryable: false, writeState: "none" },
  CONFIRMATION_REQUIRED: { http: 400, retryable: false, writeState: "none" },
  BOOKING_NOT_FOUND: { http: 404, retryable: false, writeState: "none" },
  CANCELLATION_WINDOW_CLOSED: { http: 409, retryable: false, writeState: "none" },
  BOOKING_IN_PAST: { http: 409, retryable: false, writeState: "none" },
  DEMO_CAPACITY_REACHED: { http: 429, retryable: false, writeState: "none" },
  RATE_LIMITED: { http: 429, retryable: true, writeState: "none" },
  IDEMPOTENCY_CONFLICT: { http: 422, retryable: false, writeState: "none" },
  INTERNAL: { http: 500, retryable: true, writeState: "unknown" },
  UNAVAILABLE: { http: 503, retryable: true, writeState: "none" },
};

/** Domain error thrown by the core; the error handler maps it to the envelope. */
export class SlotSureError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly say: string,
    public readonly detail?: Record<string, unknown>,
    /** override the code's default write_state (e.g. force "unknown" after a possible commit). */
    public readonly writeStateOverride?: WriteState,
  ) {
    super(code);
    this.name = "SlotSureError";
  }

  get meta(): ErrorMeta {
    const base = ERROR_META[this.code];
    return this.writeStateOverride ? { ...base, writeState: this.writeStateOverride } : base;
  }
}
