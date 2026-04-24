import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import swapRouter from './routes/swap';
import lendRouter from './routes/lend';
import triggerRouter from './routes/trigger';
import recurringRouter from './routes/recurring';
import tokensRouter from './routes/tokens';
import priceRouter from './routes/price';
import portfolioRouter from './routes/portfolio';
import sendRouter from './routes/send';
import dlmmRouter from './routes/dlmm';
import perpsRouter from './routes/perps';
import vaultRouter from './routes/vault';
import botRouter from './routes/bot';
import notisRouter from './routes/notis';

const app = express();

app.use(cors({
  origin: config.frontendOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Attach a short request ID to every request so log lines are traceable
app.use((req, res, next) => {
  const rid = (req.headers['x-request-id'] as string) || crypto.randomBytes(6).toString('hex');
  (req as express.Request & { id: string }).id = rid;
  res.setHeader('X-Request-Id', rid);
  next();
});

// Global rate limiter — generous since Jupiter has its own rate limiting
app.use(rateLimit({
  windowMs: 10 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many requests', retryable: true },
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Jupiter API proxy routes
app.use('/api/swap', swapRouter);
app.use('/api/lend', lendRouter);
app.use('/api/trigger', triggerRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/price', priceRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/send', sendRouter);
app.use('/api/dlmm', dlmmRouter);
app.use('/api/perps', perpsRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/bot', botRouter);
app.use('/api/notis', notisRouter);

// Error handler — logs full stack + request context, returns opaque error to client
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const rid = (req as express.Request & { id?: string }).id ?? '-';
  console.error(`[error] rid=${rid} ${req.method} ${req.originalUrl} — ${err.message}`);
  if (err.stack) console.error(err.stack);
  if (res.headersSent) return;
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: rid, retryable: false });
});

app.listen(config.port, () => {
  console.log(`[supasol-backend] listening on port ${config.port}`);
  console.log(`[supasol-backend] CORS origin: ${config.frontendOrigin}`);
});
