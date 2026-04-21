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
BACKEND_CHANGED=true
if git rev-parse --is-inside-work-tree &>/dev/null; then
  PRE_PULL=$(git rev-parse HEAD)
  log "Pulling latest code..."
  git pull --ff-only
  POST_PULL=$(git rev-parse HEAD)

  if [[ "$PRE_PULL" != "$POST_PULL" ]]; then
    # Check if any backend-affecting files changed
    CHANGED=$(git diff --name-only "$PRE_PULL" "$POST_PULL")
    if echo "$CHANGED" | grep -qE '^(backend/|package\.json|package-lock\.json)'; then
      BACKEND_CHANGED=true
      log "Backend changes detected — full rebuild."
    else
      BACKEND_CHANGED=false
      log "No backend changes — skipping backend rebuild."
    fi
  else
    warn "Already up to date."
    BACKEND_CHANGED=false
  fi
else
  warn "Not a git repo — skipping git pull, assuming full rebuild."
fi

# ── 2. Validate .env ──────────────────────────────────────────────────────────
[[ -f "$SCRIPT_DIR/.env" ]] || err ".env not found — run install.sh first."
source "$SCRIPT_DIR/.env" 2>/dev/null || true
[[ -z "${JUPITER_API_KEY:-}" || "$JUPITER_API_KEY" == "your_jupiter_api_key_here" ]] && \
  err "JUPITER_API_KEY not set in .env"

# ── 3. Install/sync npm deps ──────────────────────────────────────────────────
if $BACKEND_CHANGED; then
  log "Syncing npm dependencies..."
  npm ci
fi

# ── 4. Build backend ──────────────────────────────────────────────────────────
if $BACKEND_CHANGED; then
  log "Building backend..."
  cd "$SCRIPT_DIR/backend"
  npm run build
fi

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
if $BACKEND_CHANGED; then
  log "Restarting backend service..."
  sudo systemctl restart "${BACKEND_SERVICE}"
else
  log "Backend unchanged — skipping restart."
fi

SERVER_IP=$(hostname -I | awk '{print $1}')

log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  SupaSOL updated successfully!"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${BLUE}Frontend:${NC} https://${SERVER_IP}"
echo -e "  ${BLUE}Backend:${NC}  http://${SERVER_IP}:${BACKEND_PORT}/health"
log ""
