import { DateTime } from "luxon";

/**
 * Display helpers. Every response carries an ISO timestamp with offset AND a human display
 * string in the business zone (build spec §4). The zone is always the business's, never the
 * caller's.
 */
export function isoWithOffset(dt: DateTime): string {
  return dt.toISO({ suppressMilliseconds: true }) ?? "";
}

/** "Fri 30 Oct, 7:00 PM IST" */
export function displayLocal(dt: DateTime, zone: string): string {
  const local = dt.setZone(zone);
  const label = zone === "Asia/Kolkata" ? "IST" : (local.toFormat("ZZZZ") ?? "");
  return `${local.toFormat("ccc d LLL, h:mm a")} ${label}`.trim();
}

export function parseIso(start: string, zone: string): DateTime {
  return DateTime.fromISO(start, { setZone: true }).setZone(zone);
}
