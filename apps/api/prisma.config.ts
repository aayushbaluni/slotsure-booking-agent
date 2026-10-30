import { defineConfig } from "prisma/config";

// Prisma 7: connection URL + migration settings live here (not in schema.prisma).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
