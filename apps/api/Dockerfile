# SlotSure API — always-on container (build spec §3). Node 22, migrations run before start.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @slotsure/api build

FROM base AS runtime
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
# run migrations then start; /readyz gates traffic
CMD ["sh", "-c", "pnpm db:migrate && node dist/server.js"]
