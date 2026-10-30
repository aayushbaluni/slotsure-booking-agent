import { DateTime } from "luxon";
import type { OpeningHoursData } from "@slotsure/shared/ports";

/**
 * Pure slot-grid generation (build spec §4). Candidate starts sit on a `stepMins` grid inside
 * each opening-hour window for the day, and a start is offered only if the whole call plus its
 * buffer fits before the window closes: start + duration + buffer ≤ windowEnd.
 * A day may have two windows (weekend morning + evening). Nothing is precomputed or cached.
 */
export function windowsForWeekday(hours: OpeningHoursData[], isoWeekday: number): OpeningHoursData[] {
  return hours
    .filter((h) => h.weekday === isoWeekday)
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
}

export function generateCandidates(
  day: DateTime, // start of the day, in the business zone
  windows: OpeningHoursData[],
  opts: { stepMins: number; durationMins: number; bufferMins: number },
): DateTime[] {
  const out: DateTime[] = [];
  const block = opts.durationMins + opts.bufferMins;
  for (const w of windows) {
    const open = atTime(day, w.opensAt);
    const close = atTime(day, w.closesAt);
    let start = open;
    while (start.plus({ minutes: block }) <= close) {
      out.push(start);
      start = start.plus({ minutes: opts.stepMins });
    }
  }
  return out;
}

function atTime(day: DateTime, hhmm: string): DateTime {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}
