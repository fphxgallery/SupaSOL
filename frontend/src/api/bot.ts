import { apiFetch } from './client';
import type { BotConfig, BotPosition, BotLogEntry, ClosedPosition } from '../store/botStore';

export interface BotStatus {
  running: boolean;
  pubkey: string | null;
  config: BotConfig;
  positions: BotPosition[];
  closedPositions: ClosedPosition[];
  log: BotLogEntry[];
}

export async function getBotStatus(): Promise<BotStatus> {
  return apiFetch<BotStatus>('/api/bot/status');
}

export async function unlockBot(password: string, config: BotConfig): Promise<{ ok: boolean; pubkey: string }> {
  return apiFetch('/api/bot/unlock', {
    method: 'POST',
    body: JSON.stringify({ password, config }),
  });
}

export async function stopBot(): Promise<void> {
  await apiFetch('/api/bot/stop', { method: 'POST' });
}

export async function closeAllBot(): Promise<void> {
  await apiFetch('/api/bot/close-all', { method: 'POST' });
}

export async function updateBotConfig(updates: Partial<BotConfig>): Promise<void> {
  await apiFetch('/api/bot/config', { method: 'PATCH', body: JSON.stringify(updates) });
}

export async function clearBotHistory(): Promise<void> {
  await apiFetch('/api/bot/history', { method: 'DELETE' });
}

export async function clearBotLog(): Promise<void> {
  await apiFetch('/api/bot/log', { method: 'DELETE' });
}

export async function removeBotPosition(id: string): Promise<void> {
  await apiFetch(`/api/bot/positions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface PruneResult {
  removed: { id: string; symbol: string; mint: string }[];
  scanned: number;
}

export async function pruneBotPositions(): Promise<PruneResult> {
  return apiFetch<PruneResult>('/api/bot/positions/prune', { method: 'POST' });
}
