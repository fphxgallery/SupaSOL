#!/usr/bin/env bash
# SupaSOL — Ubuntu bare-metal installer
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[install]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=4000
FRONTEND_DIR=/var/www/supasol
BACKEND_SERVICE=supasol-backend

# ── 1. Check OS ───────────────────────────────────────────────────────────────
if [[ "$(uname -s)" != "Linux" ]]; then
  warn "This script targets Ubuntu/Linux. Continuing anyway..."
fi

# ── 2. Node.js 20 ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  log "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js $(node --version) already installed."
fi

# ── 3. nginx ──────────────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  log "Installing nginx..."
  sudo apt-get install -y nginx
else
  log "nginx already installed."
fi

# ── 4. .env setup ─────────────────────────────────────────────────────────────
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  warn ".env created from .env.example"
  warn "Edit $SCRIPT_DIR/.env and set JUPITER_API_KEY before starting."
fi

# Check API key
# shellcheck source=.env
source "$SCRIPT_DIR/.env" 2>/dev/null || true
if [[ -z "${JUPITER_API_KEY:-}" ]] || [[ "$JUPITER_API_KEY" == "your_jupiter_api_key_here" ]]; then
  err "Please set JUPITER_API_KEY in $SCRIPT_DIR/.env — get yours from https://portal.jup.ag/"
fi

# ── 5. Install dependencies ───────────────────────────────────────────────────
log "Installing npm dependencies..."
cd "$SCRIPT_DIR"
npm ci

# ── 6. Build backend ─────────────────────────────────────────────────────────
log "Building backend..."
cd "$SCRIPT_DIR/backend"
npm run build

# ── 7. Build frontend ─────────────────────────────────────────────────────────
log "Building frontend..."
cd "$SCRIPT_DIR/frontend"
VITE_API_BASE="http://localhost:${BACKEND_PORT}" npm run build

# ── 8. Deploy frontend to nginx ───────────────────────────────────────────────
log "Deploying frontend to $FRONTEND_DIR..."
sudo mkdir -p "$FRONTEND_DIR"
sudo cp -r "$SCRIPT_DIR/frontend/dist/." "$FRONTEND_DIR/"

sudo tee /etc/nginx/sites-available/supasol > /dev/null <<EOF
server {
    listen 80;
    server_name _;
    root $FRONTEND_DIR;
    index index.html;

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/supasol /etc/nginx/sites-enabled/supasol
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 9. systemd service for backend ───────────────────────────────────────────
log "Installing systemd service..."
sudo tee /etc/systemd/system/${BACKEND_SERVICE}.service > /dev/null <<EOF
[Unit]
Description=SupaSOL Backend
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$SCRIPT_DIR
ExecStart=$(which node) backend/dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${BACKEND_PORT}
Environment=FRONTEND_ORIGIN=http://localhost
EnvironmentFile=$SCRIPT_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "${BACKEND_SERVICE}"
sudo systemctl restart "${BACKEND_SERVICE}"

SERVER_IP=$(hostname -I | awk '{print $1}')

log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  SupaSOL installed successfully!"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${BLUE}Frontend:${NC} http://${SERVER_IP}"
echo -e "  ${BLUE}Backend:${NC}  http://${SERVER_IP}:${BACKEND_PORT}/health"
echo -e "  ${BLUE}Service:${NC}  sudo systemctl status ${BACKEND_SERVICE}"
log ""
