# SlotSure API — always-on container (build spec §3). Node 22.
# Runs via tsx: @slotsure/shared is consumed as TypeScript source through the workspace exports, so
# the server is executed with tsx (which transpiles it on the fly) rather than a prebuilt dist.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /app

# Full workspace: pnpm --frozen-lockfile needs every workspace member present to match the lockfile.
COPY . .
RUN pnpm install --frozen-lockfile

# Generate the Prisma client (no DB connection needed; a dummy URL satisfies prisma.config.ts).
RUN DATABASE_URL=postgresql://build@localhost:5432/build pnpm --filter @slotsure/api exec prisma generate

WORKDIR /app/apps/api
EXPOSE 3000
# migrate + seed (idempotent), then start. /readyz gates traffic.
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed && pnpm exec tsx src/server.ts"]
