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
  DEADLOCK: "40P01", // deadlock_detected
  SERIALIZATION_FAILURE: "40001", // serialization_failure
  QUERY_CANCELED: "57014", // statement_timeout cancelled a lock-waiting statement
  LOCK_NOT_AVAILABLE: "55P03", // lock_timeout
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
/** Transient failures where the whole transaction aborted and NOTHING committed — safe to retry.
 *  Exclusion constraints can deadlock under concurrency (two savepoint loops acquiring locks in
 *  different orders); the canonical response is to retry the transaction. */
export function isRetryableTxError(err: unknown): boolean {
  const c = pgCode(err);
  return (
    c === PG.DEADLOCK ||
    c === PG.SERIALIZATION_FAILURE ||
    c === PG.QUERY_CANCELED ||
    c === PG.LOCK_NOT_AVAILABLE
  );
}
