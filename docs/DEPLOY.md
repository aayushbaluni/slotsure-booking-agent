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

## Option C — Oracle Cloud (or any Linux VM) with Docker Compose — recommended if you have one

An Oracle Cloud **Always Free** VM (Ampere A1 / ARM, up to 4 OCPU · 24 GB) is a great fit: a real
always-on machine (never sleeps), free, with a public IP. The image is multi-arch and Prisma 7 + pg
run on arm64 Linux, so it builds on the VM directly.

```bash
# on the VM (Ubuntu): install Docker + compose plugin
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER   # re-login after

git clone <your-repo> slotsure && cd slotsure
cp .env.example .env     # fill in the 4 secrets; set AGENT_ADAPTER=mcp, FAULTS_ENABLED=true
                         # leave DATABASE_URL pointing at the compose db (host "db")

docker compose --profile full up -d --build   # starts postgres + the api container
#   the api container migrates + seeds on boot; check: curl localhost:3000/readyz
```

**HTTPS (Agentplace needs `https://<host>/mcp`)** — pick one:

- **Caddy reverse proxy** (auto Let's Encrypt). Point a domain's A record at the VM's public IP, then:
  ```bash
  docker run -d --name caddy --network host \
    -v $PWD/Caddyfile:/etc/caddy/Caddyfile -v caddy_data:/data caddy
  ```
  `Caddyfile`: `api.yourdomain.com { reverse_proxy localhost:3000 }`
- **Cloudflare Tunnel** — no inbound ports to open; free TLS; needs a Cloudflare-managed domain.
  `cloudflared tunnel --url http://localhost:3000` (or a named tunnel for a stable hostname).

**Oracle-specific gotchas (these bite everyone):**
- Open **80/443** in the OCI **Security List / NSG** (ingress rules) for the subnet.
- The instance's own firewall usually blocks by default — on Ubuntu images Oracle ships `iptables`
  rules; add ACCEPT for 80/443 and persist (`netfilter-persistent save`), or use `ufw allow`.
- Prefer the **A1 (ARM)** shape over the AMD micro — Postgres + Node want more than 1 GB.
- Keep Postgres data on a block volume or the compose named volume (`slotsure-pgdata`) so it survives
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
