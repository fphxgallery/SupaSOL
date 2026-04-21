import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { decryptPrivateKey } from '../lib/vaultCrypto';
import * as engine from '../bot/engine';
import * as botState from '../bot/state';
import type { BotConfig } from '../bot/types';

const router = Router();
const VAULT_PATH = path.join(process.cwd(), 'vault.json');

// POST /api/bot/unlock — decrypt vault + start engine
router.post('/unlock', async (req, res) => {
  const { password, config } = req.body as { password?: string; config?: Partial<BotConfig> };
  if (!password) return res.status(400).json({ error: 'password required' });

  if (!fs.existsSync(VAULT_PATH)) {
    return res.status(404).json({ error: 'No vault found. Save private key to vault first.' });
  }

  let vault: { encrypted: string; pubkey: string };
  try {
    vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8')) as { encrypted: string; pubkey: string };
  } catch {
    return res.status(500).json({ error: 'Failed to read vault' });
  }

  let secretKey: Uint8Array;
  try {
    secretKey = await decryptPrivateKey(vault.encrypted, password);
  } catch {
    return res.status(401).json({ error: 'Invalid password' });
  }

  engine.start(secretKey, config ?? {});
  res.json({ ok: true, pubkey: vault.pubkey });
});

// GET /api/bot/status
router.get('/status', (_req, res) => {
  const s = botState.getState();
  res.json({
    running: engine.isRunning(),
    pubkey: engine.getPubkey(),
    config: s.config,
    positions: s.positions,
    closedPositions: s.closedPositions,
    log: s.log,
  });
});

// PATCH /api/bot/config
router.patch('/config', (req, res) => {
  botState.setConfig(req.body as Partial<BotConfig>);
  res.json({ ok: true });
});

// POST /api/bot/stop
router.post('/stop', (_req, res) => {
  engine.stop();
  res.json({ ok: true });
});

// POST /api/bot/close-all — close positions then stop
router.post('/close-all', async (_req, res) => {
  await engine.closeAllPositions('manual close-all');
  engine.stop();
  res.json({ ok: true });
});

// DELETE /api/bot/history
router.delete('/history', (_req, res) => {
  botState.clearClosedPositions();
  res.json({ ok: true });
});

// DELETE /api/bot/log
router.delete('/log', (_req, res) => {
  botState.clearLog();
  res.json({ ok: true });
});

export default router;
