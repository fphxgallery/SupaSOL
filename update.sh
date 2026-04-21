#!/usr/bin/env bash
# SupaSOL — pull latest code and redeploy (skips one-time install steps)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[update]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=4000
FRONTEND_DIR=/var/www/supasol
BACKEND_SERVICE=supasol-backend

# ── 1. git pull ───────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"
if git rev-parse --is-inside-work-tree &>/dev/null; then
  log "Pulling latest code..."
  git pull --ff-only
else
  warn "Not a git repo — skipping git pull."
fi

# ── 2. Validate .env ──────────────────────────────────────────────────────────
[[ -f "$SCRIPT_DIR/.env" ]] || err ".env not found — run install.sh first."
source "$SCRIPT_DIR/.env" 2>/dev/null || true
[[ -z "${JUPITER_API_KEY:-}" || "$JUPITER_API_KEY" == "your_jupiter_api_key_here" ]] && \
  err "JUPITER_API_KEY not set in .env"

# ── 3. Install/sync npm deps ──────────────────────────────────────────────────
log "Syncing npm dependencies..."
npm ci

# ── 4. Build backend ──────────────────────────────────────────────────────────
log "Building backend..."
cd "$SCRIPT_DIR/backend"
npm run build

# ── 5. Build frontend ─────────────────────────────────────────────────────────
log "Building frontend..."
cd "$SCRIPT_DIR/frontend"
VITE_API_BASE="" npm run build

# ── 6. Deploy frontend ────────────────────────────────────────────────────────
log "Deploying frontend to $FRONTEND_DIR..."
sudo mkdir -p "$FRONTEND_DIR"
sudo cp -r "$SCRIPT_DIR/frontend/dist/." "$FRONTEND_DIR/"
sudo nginx -t && sudo systemctl reload nginx

# ── 7. Restart backend ────────────────────────────────────────────────────────
log "Restarting backend service..."
sudo systemctl restart "${BACKEND_SERVICE}"

SERVER_IP=$(hostname -I | awk '{print $1}')

log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  SupaSOL updated successfully!"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${BLUE}Frontend:${NC} https://${SERVER_IP}"
echo -e "  ${BLUE}Backend:${NC}  http://${SERVER_IP}:${BACKEND_PORT}/health"
log ""
