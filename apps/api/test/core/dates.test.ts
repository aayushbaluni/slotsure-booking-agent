import { describe, it, expect } from "vitest";
import { resolveDate } from "../../src/core/dates.js";
import { FrozenClock } from "../../src/clock.js";

/**
 * Sample unit test — pure core rule with a frozen clock (build spec §10, D11). Demonstrates the
 * test shape; the full matrix (T-D1…) lands in Phase 3.
 */
describe("resolveDate", () => {
  const zone = "Asia/Kolkata";

  it("resolves 'tomorrow' against now in the business zone (T-D1)", () => {
    // 23:50 IST == 18:20 UTC; 'tomorrow' must be the next IST date, not UTC
    const clock = new FrozenClock(new Date("2026-10-30T18:20:00Z"));
    const d = resolveDate("tomorrow", zone, clock);
    expect(d.toISODate()).toBe("2026-10-31");
  });

  it("parses an absolute YYYY-MM-DD in zone", () => {
    const clock = new FrozenClock(new Date("2026-10-30T00:00:00Z"));
    expect(resolveDate("2026-11-05", zone, clock).toISODate()).toBe("2026-11-05");
  });
});
