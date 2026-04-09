import express from 'express';
import cors from 'cors';
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

const app = express();

app.use(cors({
  origin: config.frontendOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error', retryable: false });
});

app.listen(config.port, () => {
  console.log(`[flashtradebot-backend] listening on port ${config.port}`);
  console.log(`[flashtradebot-backend] CORS origin: ${config.frontendOrigin}`);
});
