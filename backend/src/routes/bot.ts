import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { decryptPrivateKey } from '../lib/vaultCrypto';
import * as engine from '../bot/engine';
import * as botState from '../bot/state';
import { getDecisionLog, clearDecisionLog } from '../bot/aiAdvisor';
import { getMarketSentiment } from '../bot/marketSentiment';
import type { BotConfig } from '../bot/types';
import { validateBotConfigPatch } from '../bot/validateConfig';
import { config as appConfig } from '../config';

const router = Router();
const VAULT_PATH = path.join(process.env['BOT_STATE_DIR'] ?? process.cwd(), 'vault.json');

// Brute-force guard on vault unlock: 5 failed attempts per 15 min per IP.
// Successful unlocks do not count against the limit.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed unlock attempts. Try again later.', code: 'UNLOCK_RATE_LIMITED', retryable: true },
});

function readVaultPubkey(): string | null {
  try {
    if (!fs.existsSync(VAULT_PATH)) return null;
    const v = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8')) as { pubkey?: string };
    return v.pubkey ?? null;
  } catch { return null; }
}

// POST /api/bot/unlock — decrypt vault + start engine
router.post('/unlock', unlockLimiter, async (req, res) => {
  const { password, config } = req.body as { password?: string; config?: unknown };
  if (!password) return res.status(400).json({ error: 'password required' });

  let validatedConfig: Partial<BotConfig> = {};
  if (config !== undefined && config !== null) {
    const result = validateBotConfigPatch(config);
    if (!result.ok) {
      return res.status(400).json({ error: `Invalid config.${result.error.field}: ${result.error.message}` });
    }
    validatedConfig = result.value;
  }

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

  engine.start(secretKey, validatedConfig);
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
  const result = validateBotConfigPatch(req.body);
  if (!result.ok) {
    return res.status(400).json({ error: `Invalid ${result.error.field}: ${result.error.message}` });
  }
  botState.setConfig(result.value);
  res.json({ ok: true, config: botState.getState().config });
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

// DELETE /api/bot/positions/:id — drop a single position from state (no swap)
router.delete('/positions/:id', (req, res) => {
  const id = req.params['id'];
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const before = botState.getPositions().length;
  botState.removePosition(id);
  const after = botState.getPositions().length;
  if (after === before) return res.status(404).json({ error: 'Position not found' });
  botState.addLog({ type: 'info', message: `Position ${id.slice(0, 8)} manually removed from state` });
  res.json({ ok: true });
});

// POST /api/bot/positions/prune — remove positions whose on-chain balance is 0
router.post('/positions/prune', async (_req, res) => {
  const pubkey = engine.getPubkey() ?? readVaultPubkey();
  if (!pubkey) return res.status(400).json({ error: 'No wallet pubkey available (vault missing)' });

  const openPositions = botState.getPositions().filter((p) => p.status === 'open');
  if (openPositions.length === 0) return res.json({ removed: [], scanned: 0 });

  let owner: PublicKey;
  try { owner = new PublicKey(pubkey); } catch {
    return res.status(400).json({ error: 'Invalid vault pubkey' });
  }

  const conn = new Connection(appConfig.solanaRpcUrl, 'confirmed');
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  let parsed;
  try {
    parsed = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
  } catch (err) {
    return res.status(502).json({ error: `RPC failure: ${err instanceof Error ? err.message : 'unknown'}` });
  }

  // mint → total raw amount held across all token accounts
  const heldByMint = new Map<string, bigint>();
  for (const { account } of parsed.value) {
    const info = (account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string } } } }).parsed?.info;
    const mint = info?.mint;
    const amount = info?.tokenAmount?.amount;
    if (!mint || !amount) continue;
    heldByMint.set(mint, (heldByMint.get(mint) ?? 0n) + BigInt(amount));
  }

  const removed: { id: string; symbol: string; mint: string }[] = [];
  for (const pos of openPositions) {
    const held = heldByMint.get(pos.mint) ?? 0n;
    if (held === 0n) {
      botState.removePosition(pos.id);
      removed.push({ id: pos.id, symbol: pos.symbol, mint: pos.mint });
    }
  }
  if (removed.length > 0) {
    botState.addLog({
      type: 'info',
      message: `Pruned ${removed.length} ghost position${removed.length !== 1 ? 's' : ''}: ${removed.map((r) => r.symbol).join(', ')}`,
    });
  }
  res.json({ removed, scanned: openPositions.length });
});

// DELETE /api/bot/history
router.delete('/history', (_req, res) => {
  botState.clearClosedPositions();
  res.json({ ok: true });
});

// GET /api/bot/ai-decisions
router.get('/ai-decisions', (_req, res) => {
  res.json({ decisions: getDecisionLog() });
});

// DELETE /api/bot/ai-decisions
router.delete('/ai-decisions', (_req, res) => {
  clearDecisionLog();
  res.json({ ok: true });
});

// DELETE /api/bot/log
router.delete('/log', (_req, res) => {
  botState.clearLog();
  res.json({ ok: true });
});

// GET /api/bot/market-sentiment
router.get('/market-sentiment', (_req, res) => {
  res.json({ sentiment: getMarketSentiment() });
});

export default router;
