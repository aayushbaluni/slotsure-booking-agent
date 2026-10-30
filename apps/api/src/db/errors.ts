/**
 * PostgreSQL error codes the write path reasons about (build spec §3).
 *   23P01 — exclusion_violation  → slot overlap; roll back to savepoint and try next staff
 *   23505 — unique_violation     → a concurrent call with the same quote won; re-read & replay
 *   25P02 — in_failed_sql_transaction → the control case the savepoint strategy prevents
 */
export const PG = {
  EXCLUSION_VIOLATION: "23P01",
  UNIQUE_VIOLATION: "23505",
  IN_FAILED_TX: "25P02",
} as const;

export function pgCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) return String((err as { code: unknown }).code);
  return undefined;
}

export function isExclusionViolation(err: unknown): boolean {
  return pgCode(err) === PG.EXCLUSION_VIOLATION;
}
export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === PG.UNIQUE_VIOLATION;
}
