# SlotSure dashboard — static SPA. Built with the public API URL baked in (Vite inlines
# VITE_API_URL at build time), then served by a tiny Caddy behind the shared gap-scout Caddy.
FROM node:22-slim AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /app
COPY . .
ARG VITE_API_URL=https://slotsure.161-118-179-38.sslip.io
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @slotsure/shared design:build
RUN VITE_API_URL=$VITE_API_URL pnpm --filter @slotsure/dashboard build

FROM caddy:2-alpine
COPY --from=build /app/apps/dashboard/dist /srv
COPY apps/dashboard/static.Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
