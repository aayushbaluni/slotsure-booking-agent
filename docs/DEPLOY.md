# Deploy

The API must be **always-on** (a sleeping free tier cold-starts and times out the agent's first
tool call) and reachable over **HTTPS** at `https://<host>/mcp`, backed by a managed Postgres 16
that allows `CREATE EXTENSION btree_gist`. The container migrates + seeds (idempotent) on boot.

Generate secrets first (each ≥32 bytes):

```bash
openssl rand -base64 48   # AGENT_API_KEY
openssl rand -base64 48   # ADMIN_TOKEN
openssl rand -base64 32   # QUOTE_SECRET
openssl rand -base64 32   # CODE_SECRET
```

---

## Option A — Fly.io (config included: `fly.toml`)

```bash
fly launch --no-deploy --copy-config        # uses the committed fly.toml (app name, region bom)

# managed Postgres with btree_gist (Fly MPG, Supabase, Neon, or any Postgres 16):
#   attach a DB so DATABASE_URL is injected, e.g. for Fly Managed Postgres:
fly mpg create --region bom
fly mpg attach <db-name>                     # sets DATABASE_URL secret

fly secrets set \
  AGENT_API_KEY=... ADMIN_TOKEN=... QUOTE_SECRET=... CODE_SECRET=...

fly deploy                                   # builds apps/api/Dockerfile, migrates+seeds, starts
fly status                                   # confirm 1 machine healthy on /readyz
```

Your MCP URL is then `https://slotsure-api.fly.dev/mcp` (bearer `AGENT_API_KEY`).

## Option B — Render / Railway (no extra files)

- **Render:** New Web Service → from this repo → Docker, `apps/api/Dockerfile`. Add a Render
  PostgreSQL 16 instance; set `DATABASE_URL` from it plus the four secrets and
  `AGENT_ADAPTER=mcp`, `FAULTS_ENABLED=true`, `BUSINESS_TZ=Asia/Kolkata`. Health check path
  `/readyz`. **Use a paid instance** (free sleeps).
- **Railway:** New Project → Deploy from repo (detects the Dockerfile) → add the Postgres plugin
  (injects `DATABASE_URL`) → set the same env vars. Region Singapore.

## Option C — the shared Oracle VM (`deploy/oracle/`) — this project's target

The Oracle Always-Free VM (`ubuntu@161.118.179.38`) already runs a shared **gap-scout Caddy** that
owns 80/443 and routes by hostname over the `gap-scout_default` Docker network (same box as atelier
and gap-scout). SlotSure joins that network — it does **not** run its own Caddy.

- `deploy/oracle/docker-compose.yml` — `slotsure-db` + `slotsure-api` (no host ports); the api joins
  `gap-scout_default` so Caddy reaches it by name. Lives in `/opt/slotsure` on the VM; Postgres data
  in the `slotsure-pgdata` volume survives redeploys. The api container migrates + seeds on boot.
- `deploy/oracle/Caddyfile.snippet` — the `slotsure.ayushbaluni.in` → `slotsure-api:3000` block,
  appended once to `/opt/gap-scout/deploy/oracle/Caddyfile` (with a backup).
- `deploy/oracle/deploy.sh` — from your machine: tars the source → `scp` to the VM → rebuild +
  restart → install the Caddy route + reload → health check. Uses `~/.ssh/gapscout_oracle`.

```bash
bash deploy/oracle/deploy.sh      # ships, builds, starts, wires Caddy, checks /readyz
```

First run also generates `/opt/slotsure/.env` (mode 600) with fresh secrets and
`AGENT_ADAPTER=mcp`. **MCP URL:** `https://slotsure.ayushbaluni.in/mcp` (bearer = that `AGENT_API_KEY`).

**DNS:** add a GoDaddy **A** record `slotsure` → `161.118.179.38`. Or skip DNS entirely by changing
the hostname in `Caddyfile.snippet` to `slotsure.161-118-179-38.sslip.io` (sslip.io auto-resolves,
like the other apps on this box).

**Ports:** 80/443 are already open on this VM (gap-scout uses them), so there's nothing new to open.

**Other VMs (fresh, no gap-scout):** run your own Caddy/Cloudflare Tunnel for TLS; this `deploy/oracle`
set assumes the shared gap-scout Caddy is present.

<!-- gotchas kept for reference -->
Reference gotchas for a *fresh* Oracle VM (not needed here, since gap-scout already handled them):
- Open **80/443** in the OCI **Security List / NSG** and the instance firewall (`iptables`/`ufw`).
- Prefer the **A1 (ARM)** shape; keep Postgres data on a named volume so it survives
  redeploys.

## Dashboard (static, optional)

```bash
pnpm design:build && pnpm --filter @slotsure/dashboard build   # dist/ is static
# deploy apps/dashboard/dist to Vercel/Netlify with VITE_API_URL=https://<api-host>
```
Set the API's `DASHBOARD_ORIGIN` to the dashboard's deployed origin (CORS).

## Verify, then publish on Agentplace

1. `curl https://<host>/readyz` → `{"ok":true}`; `curl https://<host>/v1/services` → the two services.
2. Confirm `/mcp` answers with the `AGENT_API_KEY` (an MCP client lists 7 tools).
3. In Agentplace: publish a Luna agent, connect the MCP service at `https://<host>/mcp` with the
   key, paste `agent/instructions.md` + the tool descriptions, and fill the open rows in
   `platform-findings.md`. Gate: a logged-out browser opens the agent and sees slots from our API.
```
