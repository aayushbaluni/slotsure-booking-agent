#!/usr/bin/env bash
# Ships SlotSure to the shared Oracle VM and (re)starts it, mirroring atelier's deploy. Postgres
# data and /opt/slotsure/.env are left alone across deploys.
#
#   bash deploy/oracle/deploy.sh
#
# First run also: generates /opt/slotsure/.env with fresh secrets, and installs a route into the
# shared gap-scout Caddy (with a backup). Change the hostname in deploy/oracle/Caddyfile.snippet
# (and add the matching DNS) before the first run if you don't want slotsure.ayushbaluni.in.
set -euo pipefail

HOST="${SLOTSURE_SSH:-ubuntu@161.118.179.38}"
KEY="${SLOTSURE_SSH_KEY:-$HOME/.ssh/gapscout_oracle}"
cd "$(dirname "$0")/../.."

BUNDLE="$(mktemp -d)/slotsure-src.tgz"
tar --force-local \
  --exclude=./node_modules --exclude='*/node_modules' --exclude='*/dist' \
  --exclude=./.git --exclude=./.env --exclude='*.log' \
  -czf "$BUNDLE" .
echo "Uploading $(du -h "$BUNDLE" | cut -f1) of source…"
scp -o BatchMode=yes -i "$KEY" "$BUNDLE" "$HOST:/tmp/slotsure-src.tgz"

ssh -o BatchMode=yes -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -e
sudo mkdir -p /opt/slotsure
sudo chown "$(id -un)" /opt/slotsure
cd /opt/slotsure
tar -xzf /tmp/slotsure-src.tgz && rm -f /tmp/slotsure-src.tgz

# First run: generate secrets into /opt/slotsure/.env (mode 600). Never overwritten afterwards.
if [ ! -f .env ]; then
  cp .env.example .env
  gen() { openssl rand -base64 "$1" | tr -d "\n"; }
  sed -i "s|^AGENT_API_KEY=.*|AGENT_API_KEY=$(gen 48)|" .env
  sed -i "s|^ADMIN_TOKEN=.*|ADMIN_TOKEN=$(gen 48)|" .env
  sed -i "s|^QUOTE_SECRET=.*|QUOTE_SECRET=$(gen 32)|" .env
  sed -i "s|^CODE_SECRET=.*|CODE_SECRET=$(gen 32)|" .env
  sed -i "s|^AGENT_ADAPTER=.*|AGENT_ADAPTER=mcp|" .env
  sed -i "s|^FAULTS_ENABLED=.*|FAULTS_ENABLED=true|" .env
  sed -i "s|^DASHBOARD_ORIGIN=.*|DASHBOARD_ORIGIN=https://slotsure-admin.ayushbaluni.in|" .env
  chmod 600 .env
  echo "Created /opt/slotsure/.env with fresh secrets."
fi

cd /opt/slotsure/deploy/oracle
docker compose up -d --build 2>&1 | tail -3

# Install the SlotSure route into the shared gap-scout Caddy (idempotent, with a timestamped backup).
GSCADDY=/opt/gap-scout/deploy/oracle/Caddyfile
if [ -f "$GSCADDY" ] && ! grep -q "SlotSure" "$GSCADDY"; then
  sudo cp "$GSCADDY" "$GSCADDY.bak.$(date +%s)"
  sudo tee -a "$GSCADDY" < /opt/slotsure/deploy/oracle/Caddyfile.snippet >/dev/null
  docker exec gap-scout-caddy-1 caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
    || docker restart gap-scout-caddy-1
  echo "Added SlotSure route to gap-scout Caddy and reloaded."
fi

sleep 5
echo "readyz (internal):"
docker exec gap-scout-caddy-1 wget -qO- http://slotsure-api:3000/readyz || true
echo
REMOTE

echo
echo "Done. Once DNS + ports 80/443 are ready:"
echo "  https://slotsure.ayushbaluni.in/readyz   -> {\"ok\":true}"
echo "  MCP URL: https://slotsure.ayushbaluni.in/mcp   (bearer = AGENT_API_KEY in /opt/slotsure/.env)"
