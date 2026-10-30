import type { DomainEvent, EventSinkPort, RepositoryPort } from "@slotsure/shared/ports";

/**
 * Writes domain events to BookingEvent (the dashboard's audit log). A future webhook/bus
 * sink would implement EventSinkPort too and could be composed (fan-out) without core changes.
 * `detail` must never contain name, brief or code (build spec §8 redaction contract).
 */
export class DbEventSink implements EventSinkPort {
  constructor(private readonly repo: RepositoryPort) {}

  async emit(event: DomainEvent): Promise<void> {
    // repository exposes a persistence hook for events; kept here so the sink owns the mapping.
    await (this.repo as unknown as { writeEvent(e: DomainEvent): Promise<void> }).writeEvent(event);
  }
}
