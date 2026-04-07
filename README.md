# ⚡ SupaSOL

A full-featured Solana trading terminal powered by [Jupiter](https://jup.ag) and [Meteora](https://meteora.ag). Swap tokens, earn yield, place limit orders, run DCA strategies, provide liquidity, and send tokens via invite codes — all from a single self-hosted app.

![SupaSOL Dashboard](https://img.shields.io/badge/Solana-mainnet-9945FF?style=flat&logo=solana)
![Jupiter](https://img.shields.io/badge/Powered_by-Jupiter-00C853?style=flat)
![Meteora](https://img.shields.io/badge/Powered_by-Meteora-6366f1?style=flat)
![Release](https://img.shields.io/badge/release-v1.1.0-green?style=flat)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat)

---

## Features

| Feature | Description |
|---|---|
| **Swap** | Best-route token swaps via Jupiter Ultra v2 (DEX + RFQ) |
| **Lend / Earn** | Deposit & withdraw into Jupiter lending products |
| **Limit Orders** | Place and cancel trigger-based limit orders |
| **DCA** | Set up recurring dollar-cost-averaging purchases |
| **Liquidity** | Provide liquidity to Meteora DLMM pools — Spot, Curve, and Bid-Ask strategies |
| **Portfolio** | Token balances + Jupiter DeFi positions across all platforms |
| **Send** | Send tokens via claimable invite codes (clawback supported) |
| **History** | App transactions + live on-chain signature history via Solana RPC |
| **Price Charts** | Live OHLCV charts (1H / 4H / 1D / 1W / 1M) via CoinGecko |
| **Token Search** | Global search bar — find any Solana token, click to swap |
| **Settings** | RPC endpoint, cluster, slippage tolerance, priority fee |

---

## Tech Stack

### Frontend
- **React 18** + **Vite** + **TypeScript**
- **Tailwind CSS v4** — dark theme UI
- **Zustand** — wallet, settings, and UI state
- **TanStack Query** — server state + caching
- **lightweight-charts** — TradingView-style price charts
- **@solana/web3.js** + **@solana/spl-token** — on-chain interactions
- **@meteora-ag/dlmm** + **@coral-xyz/anchor** — Meteora DLMM liquidity SDK

### Backend
- **Express.js** + **TypeScript** — Jupiter & Meteora API proxy
- **express-rate-limit** — 200 req / 10s global limit
- **CORS** — configurable frontend origin whitelist
- In-memory cache for CoinGecko price history (2-min TTL)

---

## Project Structure

```
SupaSOL/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── pages/             # 10 route pages
│   │   ├── components/        # UI, charts, layout, liquidity, wallet modals
│   │   ├── hooks/             # Custom React hooks
│   │   ├── api/               # Jupiter + Meteora API client functions
│   │   ├── store/             # Zustand stores
│   │   └── config/            # Constants & token mints
│   ├── Dockerfile             # Multi-stage: Node builder → nginx
│   └── nginx.conf             # SPA routing + asset caching
│
├── backend/                   # Express API proxy
│   ├── src/
│   │   ├── routes/            # Route modules (swap, lend, trigger, dlmm…)
│   │   └── lib/               # Jupiter client + trigger JWT auth
│   └── Dockerfile             # Multi-stage: Node builder → slim runtime
│
├── docker-compose.yml         # Frontend + backend services
├── install.sh                 # Bare-metal Ubuntu deployment script
└── .env.example               # Environment variable template
```

---

## Quick Start

### Prerequisites
- **Node.js 20+**
- **npm 10+**
- A **Jupiter API key** — get one at [portal.jup.ag](https://portal.jup.ag)

### 1. Clone & install

```bash
git clone https://github.com/fphxgallery/SupaSOL.git
cd SupaSOL
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your API key:

```env
JUPITER_API_KEY=your_key_here
VITE_API_BASE=http://localhost:4000
VITE_RPC_URL=https://api.mainnet-beta.solana.com
VITE_CLUSTER=mainnet-beta
FRONTEND_ORIGIN=http://localhost:5173
PORT=4000
```

### 3. Run in development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000

---

## Docker Deployment

### Using Docker Compose

```bash
cp .env.example .env
# Edit .env with your JUPITER_API_KEY and production URLs

docker compose up --build -d
```

- Frontend (nginx): http://localhost:3000
- Backend (API): http://localhost:4000

The frontend container waits for the backend health check before starting.

### Build args (frontend)

| Arg | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:4000` | Backend API URL |
| `VITE_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `VITE_CLUSTER` | `mainnet-beta` | Solana cluster |

---

## Bare-Metal (Ubuntu)

For VPS/dedicated server deployment with systemd + nginx:

```bash
chmod +x install.sh
./install.sh
```

This script will:
1. Install Node.js 20 and nginx (if not present)
2. Build the frontend and copy to `/var/www/flashtradebot`
3. Configure nginx with SPA routing and `/api/` proxy
4. Create and enable a `flashtradebot-backend` systemd service

After install:
- Frontend: `http://your-server-ip`
- Backend health: `http://your-server-ip/api/health`
- Logs: `sudo journalctl -u flashtradebot-backend -f`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JUPITER_API_KEY` | ✅ | — | Jupiter API key from portal.jup.ag |
| `PORT` | — | `4000` | Backend server port |
| `NODE_ENV` | — | `development` | `development` or `production` |
| `FRONTEND_ORIGIN` | — | `http://localhost:5173` | CORS allowed origin |
| `VITE_API_BASE` | ✅ | — | Backend URL (used at build time) |
| `VITE_RPC_URL` | — | mainnet-beta RPC | Solana RPC endpoint |
| `VITE_CLUSTER` | — | `mainnet-beta` | Solana cluster name |

---

## Wallet

SupaSOL includes a built-in non-custodial wallet:
- **Create** — generates a new keypair with a 24-word seed phrase. The backup screen locks until you confirm you've saved the phrase.
- **Import** — paste an existing mnemonic or base58 private key

> ⚠️ Your private key is stored only in your browser's `localStorage`. Never share your seed phrase. This app does not transmit private keys to any server.

---

## API Routes

All backend routes proxy to Jupiter or Meteora with your API key injected server-side.

| Path | Description |
|---|---|
| `GET /health` | Health check |
| `GET /api/swap/*` | Quote + execute token swaps |
| `GET /api/lend/*` | Lending positions, deposit, withdraw |
| `GET /api/trigger/*` | Limit orders (create, cancel, list) |
| `GET /api/recurring/*` | DCA orders |
| `GET /api/tokens/*` | Token search & metadata |
| `GET /api/price/*` | Live prices + OHLCV history |
| `GET /api/portfolio/*` | Portfolio positions |
| `POST /api/send/*` | Craft send / clawback invite |
| `GET /api/dlmm/pairs` | Meteora DLMM pool list |
| `GET /api/dlmm/pair/:address` | Meteora pool metadata |

---

## Scripts

```bash
npm run dev        # Start frontend + backend in watch mode
npm run build      # Build both frontend and backend
npm run start      # Start production build
```

---

## Changelog

### v1.1.0
- **Meteora DLMM Liquidity** — full integration with the Meteora DLMM SDK
  - View all active positions across every pool with live APR, bin range, and claimable fees
  - Claim swap fees and LM rewards per position or all at once
  - Remove 100% of liquidity and close a position in one action
  - Pool browser with search, sorted by Fee/TVL, Volume, or APR
  - Add liquidity with **Spot**, **Curve**, and **Bid-Ask** strategy selection
  - Price range inputs auto-convert to bin IDs via SDK
- Backend proxy for Meteora REST API (`dlmm-api.meteora.ag`)
- `signAndSendLegacy` + `signAndSendAllLegacy` for legacy Transaction objects
- Meteora SDK isolated in its own Vite chunk (417 kB / 108 kB gzip)

### v1.0.1
- Token search icons now display correctly (mapped Jupiter v2 API `icon` → `logoURI`, `id` → `address`)
- SOL price display fixed for both Jupiter Price v3 response formats (with/without API key)
- Real token logos in dashboard via Jupiter CDN with letter-initial fallback
- Mobile layout: slide-over sidebar, hamburger in top nav, auto-close on navigation
- Wallet backup: locked backdrop during seed phrase step, "Copy all words" button, regenerate confirmation
- Swap transaction feedback: "Submitting…" toast + confirmed sigs recorded in History
- On-chain history: last 50 signatures from Solana RPC with skeleton loaders and retry
- Error states: Lend and Portfolio show Retry button on network failure
- Removed geo-restricted Predictions page

### v1.0.0
- Initial release

---

## License

MIT — use freely, build on top, ship your own terminal.

---

<p align="center">Built with ⚡ on <a href="https://solana.com">Solana</a> · Powered by <a href="https://jup.ag">Jupiter</a> & <a href="https://meteora.ag">Meteora</a></p>
