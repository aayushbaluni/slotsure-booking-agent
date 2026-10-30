import { DateTime } from "luxon";
import type { ClockPort } from "@slotsure/shared/ports";
import { SlotSureError } from "@slotsure/shared";

/**
 * Server-side date resolution — the model passes words ("tomorrow", "Saturday"), the server
 * resolves them in the business zone (build spec §4). Never trust the caller's clock/zone.
 */
export function resolveDate(input: string, zone: string, clock: ClockPort): DateTime {
  const now = DateTime.fromJSDate(clock.now(), { zone });
  const word = input.trim().toLowerCase();

  if (word === "today") return now.startOf("day");
  if (word === "tomorrow") return now.plus({ days: 1 }).startOf("day");

  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const wd = weekdays.indexOf(word);
  if (wd >= 0) {
    // next date (including today) whose ISO weekday matches
    let d = now.startOf("day");
    for (let i = 0; i < 7; i++) {
      if (d.weekday === wd + 1) return d;
      d = d.plus({ days: 1 });
    }
  }

  const abs = DateTime.fromFormat(input, "yyyy-MM-dd", { zone });
  if (abs.isValid) return abs.startOf("day");

  throw new SlotSureError("DATE_UNRESOLVABLE", "Which day would you like? A specific date works best.");
}

export function businessNow(zone: string, clock: ClockPort): string {
  return DateTime.fromJSDate(clock.now(), { zone }).toISO() ?? "";
}
