import express from 'express';
import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from '../lib/atomicWrite';
import { createLogger } from '../lib/logger';

const router = express.Router();
const log = createLogger('vault');

const VAULT_PATH = path.join(process.env['BOT_STATE_DIR'] ?? process.cwd(), 'vault.json');

interface VaultData {
  encrypted: string;
  pubkey: string;
}

function readVault(): VaultData | null {
  try {
    if (!fs.existsSync(VAULT_PATH)) return null;
    return JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8')) as VaultData;
  } catch {
    return null;
  }
}

router.get('/', (_req, res) => {
  const vault = readVault();
  if (!vault) return res.json({ exists: false });
  res.json({ exists: true, encrypted: vault.encrypted, pubkey: vault.pubkey });
});

router.post('/', (req, res) => {
  const { encrypted, pubkey } = req.body as Partial<VaultData>;
  if (!encrypted || !pubkey) {
    return res.status(400).json({ error: 'Missing encrypted or pubkey' });
  }
  if (typeof encrypted !== 'string' || encrypted.length > 10_000) {
    return res.status(400).json({ error: 'Invalid encrypted payload' });
  }
  if (typeof pubkey !== 'string' || pubkey.length > 100) {
    return res.status(400).json({ error: 'Invalid pubkey' });
  }
  try {
    atomicWriteFileSync(VAULT_PATH, JSON.stringify({ encrypted, pubkey }));
    res.json({ ok: true });
  } catch (err) {
    log.error('write failed', err);
    res.status(500).json({ error: 'Failed to save vault' });
  }
});

router.delete('/', (_req, res) => {
  try {
    if (fs.existsSync(VAULT_PATH)) fs.unlinkSync(VAULT_PATH);
    res.json({ ok: true });
  } catch (err) {
    log.error('delete failed', err);
    res.status(500).json({ error: 'Failed to delete vault' });
  }
});

export default router;
