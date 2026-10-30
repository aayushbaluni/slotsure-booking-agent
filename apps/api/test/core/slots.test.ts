import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { generateCandidates, windowsForWeekday } from "../../src/core/slots.js";

const zone = "Asia/Kolkata";
const day = DateTime.fromISO("2026-11-02T00:00:00", { zone }); // a Monday

describe("generateCandidates", () => {
  it("fits start + duration + buffer before the window close (D6)", () => {
    // 18:00–21:00, 30min + 15min buffer, 15min grid. Last start must be 20:15 (20:15+45=21:00).
    const windows = [{ weekday: 1, opensAt: "18:00", closesAt: "21:00" }];
    const starts = generateCandidates(day, windows, { stepMins: 15, durationMins: 30, bufferMins: 15 });
    expect(starts[0]!.toFormat("HH:mm")).toBe("18:00");
    expect(starts.at(-1)!.toFormat("HH:mm")).toBe("20:15");
    expect(starts.some((s) => s.toFormat("HH:mm") === "20:30")).toBe(false); // 20:30+45 = 21:15 > close
  });

  it("handles two windows in a day (weekend)", () => {
    const windows = [
      { weekday: 6, opensAt: "10:00", closesAt: "13:00" },
      { weekday: 6, opensAt: "17:00", closesAt: "20:00" },
    ];
    const starts = generateCandidates(day, windows, { stepMins: 15, durationMins: 30, bufferMins: 15 });
    expect(starts.some((s) => s.toFormat("HH:mm") === "10:00")).toBe(true);
    expect(starts.some((s) => s.toFormat("HH:mm") === "17:00")).toBe(true);
    // nothing in the midday gap
    expect(starts.some((s) => s.hour === 14)).toBe(false);
  });
});

describe("windowsForWeekday", () => {
  it("filters and sorts windows for the given ISO weekday", () => {
    const hours = [
      { weekday: 6, opensAt: "17:00", closesAt: "20:00" },
      { weekday: 6, opensAt: "10:00", closesAt: "13:00" },
      { weekday: 1, opensAt: "18:00", closesAt: "21:00" },
    ];
    const sat = windowsForWeekday(hours, 6);
    expect(sat.map((w) => w.opensAt)).toEqual(["10:00", "17:00"]);
  });
});
