import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { isStartFree } from "../../src/core/availability.js";
import type { OccupiedRange } from "@slotsure/shared/ports";

const zone = "Asia/Kolkata";
const at = (hhmm: string) => DateTime.fromISO(`2026-11-02T${hhmm}:00`, { zone });
const range = (staffId: string, from: string, until: string): OccupiedRange => ({
  staffId,
  startsAt: at(from).toJSDate(),
  blockedUntil: at(until).toJSDate(),
});

describe("isStartFree (half-open overlap)", () => {
  const block = 45; // 30 duration + 15 buffer
  const staff = ["ayush"];

  it("blocks a start overlapping an existing booking's range", () => {
    // 18:00 booking blocks until 18:45; an 18:30 start overlaps.
    const occ = [range("ayush", "18:00", "18:45")];
    expect(isStartFree(at("18:30"), block, staff, occ)).toBe(false);
  });

  it("allows a start exactly at the end of a blocked range (half-open [))", () => {
    // range [18:00, 18:45); a start at 18:45 → [18:45, 19:30) does NOT overlap.
    const occ = [range("ayush", "18:00", "18:45")];
    expect(isStartFree(at("18:45"), block, staff, occ)).toBe(true);
  });

  it("is free when a second eligible resource is open", () => {
    const occ = [range("ayush", "19:00", "19:45")];
    expect(isStartFree(at("19:00"), block, ["ayush", "intern"], occ)).toBe(true); // intern is free
    expect(isStartFree(at("19:00"), block, ["ayush"], occ)).toBe(false);
  });
});
