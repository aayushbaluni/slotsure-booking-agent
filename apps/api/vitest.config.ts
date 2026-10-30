import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // DB integration tests (race, phase3) share one Postgres and one business; phase3's reset
    // clears bookings globally. Run test files sequentially so they can't clobber each other.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
