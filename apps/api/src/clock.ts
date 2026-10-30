import type { ClockPort } from "@slotsure/shared/ports";

/** Production clock. Tests bind a FrozenClock instead (same port). */
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

/** Test helper — freeze time so clock-dependent tests never flake (build spec D11). */
export class FrozenClock implements ClockPort {
  constructor(private at: Date) {}
  now(): Date {
    return this.at;
  }
  set(at: Date): void {
    this.at = at;
  }
}
