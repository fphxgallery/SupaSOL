import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getConfig,
  updateConfig,
  fetchTelegramChats,
  testTelegram,
  type UpdatePayload,
} from '../lib/notifier';

const router = Router();

// Slow Telegram getUpdates calls — cap spam
const telegramLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many Telegram requests', retryable: true },
});

router.get('/config', (_req, res) => {
  res.json(getConfig());
});

router.put('/config', (req, res) => {
  const body = req.body as UpdatePayload;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'invalid body' });
  }
  try {
    updateConfig(body);
    res.json(getConfig());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'save failed' });
  }
});

router.post('/telegram/chats', telegramLimiter, async (req, res) => {
  const { token } = (req.body ?? {}) as { token?: string };
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required' });
  }
  try {
    const chats = await fetchTelegramChats(token);
    res.json({ chats });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'failed' });
  }
});

router.post('/telegram/test', telegramLimiter, async (_req, res) => {
  try {
    await testTelegram();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'failed' });
  }
});

export default router;
