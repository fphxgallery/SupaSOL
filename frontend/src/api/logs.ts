import { apiFetch } from './client';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BackendLogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  scope: string;
  msg: string;
  meta?: string;
}

export type NetSource = 'jupiter' | 'openai' | 'solana' | 'telegram' | 'other';

export interface NetEntry {
  id: string;
  ts: number;
  source: NetSource;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export async function getBackendLogs(): Promise<{ entries: BackendLogEntry[] }> {
  return apiFetch<{ entries: BackendLogEntry[] }>('/api/logs/backend');
}

export async function clearBackendLogs(): Promise<void> {
  await apiFetch('/api/logs/backend', { method: 'DELETE' });
}

export async function getNetworkLogs(): Promise<{ entries: NetEntry[] }> {
  return apiFetch<{ entries: NetEntry[] }>('/api/logs/network');
}

export async function clearNetworkLogs(): Promise<void> {
  await apiFetch('/api/logs/network', { method: 'DELETE' });
}
