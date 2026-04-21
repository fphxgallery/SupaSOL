# ⚡ SupaSOL

A full-featured Solana trading terminal powered by [Jupiter](https://jup.ag), [Meteora](https://meteora.ag), and [Flash Trade](https://flash.trade). Swap tokens, earn yield, trade perpetual futures, place limit orders, run DCA strategies, provide liquidity, browse trending tokens, and send tokens via invite codes — all from a single self-hosted app.

![SupaSOL Dashboard](https://img.shields.io/badge/Solana-mainnet-9945FF?style=flat&logo=solana)
![Jupiter](https://img.shields.io/badge/Powered_by-Jupiter-00C853?style=flat)
![Meteora](https://img.shields.io/badge/Powered_by-Meteora-6366f1?style=flat)
![Flash Trade](https://img.shields.io/badge/Powered_by-Flash_Trade-f97316?style=flat)
![Release](https://img.shields.io/badge/release-v1.7.3-green?style=flat)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat)

---

## Features

| Feature | Description |
|---|---|
| **Swap** | Best-route token swaps via Jupiter Ultra v2 (DEX + RFQ) with wallet token selector |
| **Trending** | Jupiter organic score leaderboard — bot-filtered token rankings with 5m/1h/6h/24h intervals, price, change, volume, and one-click buy |
| **Lend / Earn** | Deposit & withdraw into Jupiter lending products — markets and positions unified in one view, deposited amount shown per market card |
| **Perps** | Long/short perpetual futures on crypto and equities via Flash Trade — live preview, SL/TP orders, and collateral management |
| **Limit Orders** | Place and cancel trigger-based limit orders |
| **DCA** | Set up recurring dollar-cost-averaging purchases |
| **Liquidity** | Provide liquidity to Meteora DLMM pools — Spot, Curve, and Bid-Ask strategies |
| **Portfolio** | Token balances + Jupiter DeFi positions across all platforms |
| **Send** | Send tokens via claimable invite codes (clawback supported) |
| **History** | App transactions + live on-chain signature history via Solana RPC |
| **Price Charts** | Live OHLCV charts (1H / 4H / 1D / 1W / 1M) via Pyth Network |
| **Token Search** | Global search bar — find any Solana token, click to swap |
| **Auto Trader** | Automated meme coin sniper — configurable entry/exit rules, trailing stop, take profit, max hold time, rebuy cooldown, organic score filter, candidate sorting by score, and live P&L chart |
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
- **Express.js** + **TypeScript** — Jupiter, Meteora & Flash Trade API proxy
- **express-rate-limit** — 200 req / 10s global limit
- **CORS** — configurable frontend origin whitelist

---

## Project Structure

```
SupaSOL/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── pages/             # 12 route pages
│   │   ├── components/        # UI, charts, layout, liquidity, wallet modals
│   │   ├── hooks/             # Custom React hooks
│   │   ├── api/               # Jupiter, Meteora & Flash Trade client functions
│   │   ├── store/             # Zustand stores
│   │   └── config/            # Constants & token mints
│   ├── Dockerfile             # Multi-stage: Node builder → nginx
│   └── nginx.conf             # SPA routing + asset caching
│
├── backend/                   # Express API proxy
│   ├── src/
│   │   ├── routes/            # Route modules (swap, lend, trigger, dlmm, perps, tokens…)
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
- A **Helius API key** (recommended) — get one at [helius.dev](https://helius.dev) for reliable RPC

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

Edit `.env`:

```env
JUPITER_API_KEY=your_key_here
VITE_API_BASE=http://localhost:4000
VITE_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_key
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
2. Build the frontend and copy to `/var/www/supasol`
3. Configure nginx with SPA routing and `/api/` proxy
4. Create and enable a `supasol-backend` systemd service

After install:
- Frontend: `http://your-server-ip`
- Backend health: `http://your-server-ip/api/health`
- Logs: `sudo journalctl -u supasol-backend -f`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JUPITER_API_KEY` | ✅ | — | Jupiter API key from portal.jup.ag |
| `PORT` | — | `4000` | Backend server port |
| `NODE_ENV` | — | `development` | `development` or `production` |
| `FRONTEND_ORIGIN` | — | `http://localhost:5173` | CORS allowed origin |
| `VITE_API_BASE` | ✅ | — | Backend URL (used at build time) |
| `VITE_RPC_URL` | — | mainnet-beta RPC | Solana RPC endpoint (Helius recommended) |
| `VITE_CLUSTER` | — | `mainnet-beta` | Solana cluster name |

---

## Wallet

SupaSOL includes a built-in non-custodial wallet:
- **Create** — generates a new keypair with a 24-word seed phrase. The backup screen locks until you confirm you've saved the phrase.
- **Import** — paste an existing mnemonic or base58 private key

> ⚠️ Your private key is stored only in your browser's `localStorage`. Never share your seed phrase. This app does not transmit private keys to any server.

---

## API Routes

All backend routes proxy to Jupiter, Meteora, or Flash Trade with your API key injected server-side.

| Path | Description |
|---|---|
| `GET /health` | Health check |
| `GET /api/swap/*` | Quote + execute token swaps |
| `GET /api/lend/*` | Lending positions, deposit, withdraw |
| `GET /api/trigger/*` | Limit orders (create, cancel, list) |
| `GET /api/recurring/*` | DCA orders |
| `GET /api/tokens/*` | Token search, metadata, trending rankings |
| `GET /api/price/*` | Live prices |
| `GET /api/portfolio/*` | Portfolio positions |
| `POST /api/send/*` | Craft send / clawback invite |
| `GET /api/dlmm/pairs` | Meteora DLMM pool list |
| `GET /api/dlmm/pair/:address` | Meteora pool metadata |
| `GET /api/perps/pool-data` | Flash Trade markets + custody stats |
| `GET /api/perps/prices` | Flash Trade mark prices (live) |
| `GET /api/perps/positions/:wallet` | Open perp positions with PnL |
| `GET /api/perps/orders/:wallet` | Open SL/TP trigger orders |
| `POST /api/perps/open` | Build open position transaction |
| `POST /api/perps/close` | Build close position transaction |
| `POST /api/perps/add-collateral` | Build add collateral transaction |
| `POST /api/perps/remove-collateral` | Build remove collateral transaction |
| `POST /api/perps/trigger` | Build stop loss / take profit transaction |
| `POST /api/perps/cancel-trigger` | Cancel SL/TP order |

---

## Scripts

```bash
npm run dev        # Start frontend + backend in watch mode
npm run build      # Build both frontend and backend
npm run start      # Start production build
```

---

## Changelog

### v1.7.3
- Lend / Earn page redesigned — Available Markets and My Positions merged into a single unified view
- Deposited amount and USD value now shown bottom-left of each market card inline
- Total deposited and position count moved to compact inline header strip
- Deposit/Withdraw mode toggle moved inline with input to reduce vertical space
- 2-column grid on large screens eliminates wasted whitespace

### v1.7.2
- Auto Trader: `rebuyCooldownMinutes` added as an independent config field (default: 60m)
- Cooldown is now separate from max hold time — both can be tuned independently
- UI input added to Exit card; set to 0 to disable cooldown entirely

### v1.7.1
- Auto Trader: trending token candidates sorted by organic score (desc) before buying — best signals get position slots first when capacity is limited
- Auto Trader: rebuy cooldown blocks re-entering a token that was just stopped out within the cooldown window

### v1.7.0
- DLMM pool browser overhauled with smarter filtering and scanning
  - TVL filter replaced with min/max range text inputs (supports `25k`, `1m` etc.) — defaults to $25K min
  - Bin step filter added — filters pools with step ≥ value, defaults to 100
  - **Scan button** — filters and sort are committed on click, not on every keystroke
  - Sort buttons (Fee/TVL, Volume, TVL) trigger a fresh server fetch on click
  - APR sort removed — replaced by Fee/TVL (`fee_tvl_ratio_24h:desc`) which is the correct metric
  - Fixed Meteora API TVL filter: now uses `filter_by=tvl>VALUE` (was sending unsupported `min_tvl`)
  - "Other…" wallet button renamed to "Import"

### v1.6.9
- DLMM token icons now load correctly — icon lookups proxied through backend to fix CORS errors
- Backend caches token icons 24h in-memory, eliminating repeat Jupiter API calls and 429s
- Auto Trader runs as a background systemd process — continues trading without browser open
- `update.sh` skips backend rebuild when no backend files changed (faster redeployment)

### v1.6.5
- Auto Trader entry fields: suffixes/units now displayed inside input fields; all fields uniform width
- Activity Log card height capped to match other dashboard cards

### v1.6.0
- Auto Trader: price change filter replaced with a min/max **Price Chg Range** (was single min value)
- HTTPS support added to bare-metal install — self-signed TLS cert generated automatically
- `install.sh` now auto-detects and sets `FRONTEND_ORIGIN` to the server IP
- Fixed relative API base path in production builds

### v1.5.0
- **Auto Trader** — automated meme coin sniper bot
  - Configurable entry rules: signal interval, poll rate, buy amount, max positions, min organic score, price change range, price impact, mcap range, slippage, and skip filters (suspicious, mintable, freezable)
  - Configurable exit rules: trailing stop %, take profit %, max hold time
  - Live Activity Log with buy/sell events and Solana Explorer links
  - Cumulative P&L chart with per-trade history
  - Encrypted private key vault — key never leaves the browser unencrypted
  - Close empty token accounts utility

### v1.4.3
- Portfolio tab: token detail panel with quick-sell on row click
- Portfolio tab: 24h price change column on token holdings
- Close empty token accounts button (reclaim rent)
- Fixed stale chart on token switch

### v1.4.2
- Trending tab: organic buyers column, interval filters, and one-click quick buy buttons
- DLMM tab redesigned with Trending-style layout

### v1.3.0
- **Trending tab** — Jupiter organic score token leaderboard
  - 5m / 1h / 6h / 24h interval selector with per-interval price change and volume
  - Rank, logo, name/symbol, price, % change, volume, organic score, and audit warnings per row
  - Click any row to expand a full TokenInfoPanel with price, liquidity, market cap, and safety audit
  - Buy button navigates directly to Swap with the token pre-selected
  - 30s auto-refresh; data pulled directly from Jupiter toptrending API (no extra price calls)

### v1.2.10
- **Perps SL/TP fixes**
  - Fixed error 6039 "Exponent Mismatch" for equity trigger orders (SPY etc.) — Flash Trade API hard-codes exponent -6 but equity oracles use -5; now patches transaction instruction bytes post-build
  - SL/TP orders now visible on position cards — added `/orders/owner/:wallet` endpoint and merged trigger data into position display
  - Switched RPC to Helius for reliable blockhash fetching (avoids public endpoint 403s)

### v1.2.9
- Meteora DLMM Add Liquidity modal redesigned to match Meteora UI
- Fixed error 6040 "Invalid position width" — removed ±1 bin padding that exceeded 70-bin limit; default range targets ~30 bins using bin-step math

### v1.2.8
- Swap page wallet token selector — "You Pay" token dropdown shows your wallet balances at the top
- Dashboard price card shows BTC, SOL, and SPY via Flash Trade API; clicking a ticker switches the chart

### v1.2.7
- Swap page redesigned to single centered column with Jupiter-style TokenInfoPanel for output token (price, liquidity, market cap, audit flags)
- Wallet balance displayed for all tokens in "You Pay" field (not just SOL)

### v1.2.0
- **Perps tab** — perpetual futures trading via Flash Trade
  - Long/short on SOL, BTC, ETH, JitoSOL, JUP, BONK, WIF, PYTH, JTO, RAY, plus equities (SPY, NVDA, TSLA, AAPL, AMD, AMZN) and commodities (XAU, XAG)
  - 1×–10× leverage with presets and slider
  - Live entry price + liquidation price preview
  - Stop Loss / Take Profit orders with on-chain validation
  - Add / Remove collateral to adjust leverage
  - TradingView-style price chart above the trade form via Pyth Network OHLCV
  - Live mark prices polled every 5s; positions refreshed every 15s

### v1.1.0
- **Meteora DLMM Liquidity** — full integration with the Meteora DLMM SDK
  - View all active positions across every pool with live APR, bin range, and claimable fees
  - Claim swap fees and LM rewards per position or all at once
  - Remove 100% of liquidity and close a position in one action
  - Pool browser with search, sorted by Fee/TVL, Volume, or APR
  - Add liquidity with Spot, Curve, and Bid-Ask strategy selection

### v1.0.1
- Token search icons, SOL price display, real token logos via Jupiter CDN
- Mobile layout: slide-over sidebar with hamburger, auto-close on navigation
- Wallet backup flow, swap transaction feedback, on-chain history

### v1.0.0
- Initial release

---

## License

MIT — use freely, build on top, ship your own terminal.

---

<p align="center">Built with ⚡ on <a href="https://solana.com">Solana</a> · Powered by <a href="https://jup.ag">Jupiter</a>, <a href="https://meteora.ag">Meteora</a> & <a href="https://flash.trade">Flash Trade</a></p>
