import type { BookingRecord, NotifierPort } from "@slotsure/shared/ports";

/**
 * Demo-safety adapter: sends nothing. Enforces "no message is sent" (build spec §2).
 * Real channels (email/SMS/WhatsApp) plug in behind the same port, with consent, later.
 */
export class NoopNotifier implements NotifierPort {
  readonly name = "none";
  async bookingConfirmed(_b: BookingRecord): Promise<void> {}
  async bookingCancelled(_b: BookingRecord): Promise<void> {}
}
