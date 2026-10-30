import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Per-connection Postgres statement timeout (build spec §8, F2). Any single statement that runs
 * longer than this is aborted (error 57014), so a slow/stuck query can't hang past the request
 * budget. Paired with Fastify's requestTimeout (8s) in server.ts.
 */
export const STATEMENT_TIMEOUT_MS = 3000;
export const PG_SESSION_OPTIONS = `-c statement_timeout=${STATEMENT_TIMEOUT_MS}`;

/** The write pool additionally sets a short lock_timeout so a contended insert (exclusion-constraint
 *  conflict wait) fails fast with a retryable error (55P03) instead of blocking to the statement
 *  timeout — the createBooking retry loop then cycles quickly under concurrency. */
export const WRITE_POOL_OPTIONS = `-c statement_timeout=${STATEMENT_TIMEOUT_MS} -c lock_timeout=1500`;

/**
 * Prisma 7 client created with the pg driver adapter. A raw `pg` Pool is also used for the
 * race-safe write path (explicit SAVEPOINT/RELEASE/ROLLBACK TO); both carry the statement timeout.
 */
export function createPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl, options: PG_SESSION_OPTIONS });
  return new PrismaClient({ adapter });
}
