import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { PG_SESSION_OPTIONS, STATEMENT_TIMEOUT_MS } from "../../src/db/prisma.js";

/**
 * F2 (build spec §8): a statement that runs past the 3s statement timeout is aborted by Postgres
 * with SQLSTATE 57014 (query_canceled), so a slow/stuck query cannot hang past the request
 * budget. Verifies the exact session options string the app ships applies the timeout.
 */
const url = process.env.DATABASE_URL;
let pool: Pool | undefined;

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!url)("F2: statement timeout", () => {
  it(`aborts a statement running past ${STATEMENT_TIMEOUT_MS}ms with 57014`, async () => {
    pool = new Pool({ connectionString: url, options: PG_SESSION_OPTIONS });
    let code: string | undefined;
    const started = Date.now();
    try {
      await pool.query("SELECT pg_sleep(6)"); // 6s > 3s timeout
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe("57014");
    expect(Date.now() - started).toBeLessThan(5000); // cancelled near 3s, well under the 8s budget
  });
});
