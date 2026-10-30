#!/usr/bin/env bash
# One-shot SlotSure deploy for a Linux VM (Oracle Cloud A1 or any host).
# Idempotent: run it, follow the prompt to set your domain, run it again. Usage:
#   git clone <repo> slotsure && cd slotsure && bash deploy/setup-vm.sh
set -euo pipefail

cd "$(dirname "$0")/.." # repo root
COMPOSE="deploy/docker-compose.prod.yml"

echo "==> SlotSure VM setup"

# 1. Docker -------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker…"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  echo "Docker installed. Log out and back in (for the docker group), then re-run this script."
  exit 0
fi

# 2. .env with generated secrets ---------------------------------------------
gen() { openssl rand -base64 "$1" | tr -d '\n'; }
if [ ! -f .env ]; then
  echo "==> Creating .env with fresh secrets…"
  cp .env.example .env
  # '|' is a safe sed delimiter: base64 never contains it
  sed -i "s|^AGENT_API_KEY=.*|AGENT_API_KEY=$(gen 48)|" .env
  sed -i "s|^ADMIN_TOKEN=.*|ADMIN_TOKEN=$(gen 48)|" .env
  sed -i "s|^QUOTE_SECRET=.*|QUOTE_SECRET=$(gen 32)|" .env
  sed -i "s|^CODE_SECRET=.*|CODE_SECRET=$(gen 32)|" .env
  sed -i "s|^AGENT_ADAPTER=.*|AGENT_ADAPTER=mcp|" .env
  sed -i "s|^FAULTS_ENABLED=.*|FAULTS_ENABLED=true|" .env
  cat <<'EOF'

.env created with fresh secrets. Next:
  1. Edit .env and set your API domain, e.g.:   API_DOMAIN=api.yourdomain.com
     (optionally DASHBOARD_ORIGIN=https://admin.yourdomain.com for CORS)
  2. Point that domain's DNS A record at THIS VM's public IP.
  3. Re-run:   bash deploy/setup-vm.sh

Your admin token (for the dashboard) and agent key (for Agentplace) are in .env.
EOF
  exit 0
fi

# 3. require API_DOMAIN -------------------------------------------------------
API_DOMAIN="$(grep -E '^API_DOMAIN=' .env | cut -d= -f2- || true)"
if [ -z "${API_DOMAIN}" ]; then
  echo "ERROR: set API_DOMAIN=api.yourdomain.com in .env (and point its DNS at this VM), then re-run."
  exit 1
fi

# 4. firewall reminder (NOT auto-applied — editing iptables blindly can lock you out) -------------
cat <<EOF

==> FIREWALL — make sure 80 and 443 are open (one time):
    • OCI console: add ingress rules for TCP 80 and 443 to this subnet's Security List / NSG.
    • On the VM (Oracle Ubuntu images block by default), run once:
        sudo iptables -I INPUT 6 -p tcp --dport 80  -j ACCEPT
        sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
        sudo netfilter-persistent save
      (On firewalld hosts: sudo firewall-cmd --add-service={http,https} --permanent && sudo firewall-cmd --reload)

EOF

# 5. bring the stack up ------------------------------------------------------
echo "==> Building and starting db + api + caddy for ${API_DOMAIN}…"
docker compose --env-file .env -f "$COMPOSE" up -d --build

cat <<EOF

==> Up. Caddy is obtaining a TLS certificate for ${API_DOMAIN} (needs DNS + ports 80/443).
    Verify:   curl https://${API_DOMAIN}/readyz        -> {"ok":true}
              curl https://${API_DOMAIN}/v1/services    -> the two services
    MCP URL:  https://${API_DOMAIN}/mcp   (bearer = AGENT_API_KEY from .env)
    Logs:     docker compose -f ${COMPOSE} logs -f
EOF
