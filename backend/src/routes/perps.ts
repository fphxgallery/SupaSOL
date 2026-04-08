import { Router, Request, Response } from 'express';

const router = Router();
const FLASH_BASE = 'https://flashapi.trade';

// Flash Trade doesn't require an API key — no auth header needed.
async function proxyToFlashTrade(
  req: Request,
  res: Response,
  flashPath: string,
  extraQuery?: Record<string, string>,
) {
  const url = new URL(`${FLASH_BASE}${flashPath}`);

  // Forward all incoming query params
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') url.searchParams.set(k, v);
  }
  // Append any hardcoded extra params
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      url.searchParams.set(k, v);
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(req.body);
  }

  const upstream = await fetch(url.toString(), init);
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

// Market & price data
router.get('/pool-data', (req, res) => proxyToFlashTrade(req, res, '/pool-data'));
router.get('/prices', (req, res) => proxyToFlashTrade(req, res, '/prices'));

// Open positions — required params per Flash Trade API
router.get('/positions/:wallet', (req, res) =>
  proxyToFlashTrade(req, res, `/positions/owner/${req.params.wallet}`, {
    includePnl: 'true',
    includeLiquidationPrice: 'true',
    includePnlInLeverageDisplay: 'true',
  }),
);

// Transaction builders
router.post('/open', (req, res) =>
  proxyToFlashTrade(req, res, '/transaction-builder/open-position'),
);
router.post('/close', (req, res) =>
  proxyToFlashTrade(req, res, '/transaction-builder/close-position'),
);
router.post('/add-collateral', (req, res) =>
  proxyToFlashTrade(req, res, '/transaction-builder/add-collateral'),
);
router.post('/remove-collateral', (req, res) =>
  proxyToFlashTrade(req, res, '/transaction-builder/remove-collateral'),
);
router.post('/trigger', (req, res) =>
  proxyToFlashTrade(req, res, '/transaction-builder/place-trigger-order'),
);
router.post('/cancel-trigger', (req, res) =>
  proxyToFlashTrade(req, res, '/transaction-builder/cancel-trigger-order'),
);

export default router;
