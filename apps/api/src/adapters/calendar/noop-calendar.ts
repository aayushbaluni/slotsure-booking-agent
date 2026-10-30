import type { BookingRecord, CalendarPort } from "@slotsure/shared/ports";

/**
 * Demo-safety adapter: does nothing. This is what enforces "no code path writes to an external
 * calendar" (build spec §2). Going real later = swap this for GoogleCalendar/Outlook behind the
 * same port; the booking core never changes.
 */
export class NoopCalendar implements CalendarPort {
  readonly name = "noop";
  async onBooked(_b: BookingRecord): Promise<void> {}
  async onCancelled(_b: BookingRecord): Promise<void> {}
}
