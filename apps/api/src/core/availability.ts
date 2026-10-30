import { DateTime } from "luxon";
import type { OccupiedRange } from "@slotsure/shared/ports";

/**
 * A start is AVAILABLE if at least one eligible person has no confirmed booking overlapping
 * [start, start + duration + buffer) (build spec §4). Half-open ranges: a booking ending exactly
 * at `start` does not block it. Pure — occupied ranges are fetched by the core and passed in.
 */
export function isStartFree(
  start: DateTime,
  blockMins: number,
  eligibleStaffIds: string[],
  occupied: OccupiedRange[],
): boolean {
  const s = start.toMillis();
  const e = start.plus({ minutes: blockMins }).toMillis();
  return eligibleStaffIds.some((staffId) => {
    const ranges = occupied.filter((o) => o.staffId === staffId);
    return !ranges.some((o) => overlaps(s, e, o.startsAt.getTime(), o.blockedUntil.getTime()));
  });
}

/** half-open [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅ */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function filterFree(
  candidates: DateTime[],
  blockMins: number,
  eligibleStaffIds: string[],
  occupied: OccupiedRange[],
): DateTime[] {
  return candidates.filter((c) => isStartFree(c, blockMins, eligibleStaffIds, occupied));
}
