import { apiFetch } from './client';

export type NotisEvent =
  | 'bot.entry'
  | 'bot.exit'
  | 'bot.veto'
  | 'bot.start'
  | 'bot.stop'
  | 'bot.error';

export interface NotisConfig {
  telegram: {
    enabled: boolean;
    tokenMasked: string;
    hasToken: boolean;
    chatId: string;
    events: Record<NotisEvent, boolean>;
  };
  lastSend?: { ok: boolean; ts: number; error?: string };
}

export interface TgChat {
  id: string;
  label: string;
  type: string;
}

export interface NotisUpdate {
  telegram?: {
    enabled?: boolean;
    token?: string;
    chatId?: string;
    events?: Partial<Record<NotisEvent, boolean>>;
  };
}

export function getNotisConfig(): Promise<NotisConfig> {
  return apiFetch<NotisConfig>('/api/notis/config');
}

export function updateNotisConfig(body: NotisUpdate): Promise<NotisConfig> {
  return apiFetch<NotisConfig>('/api/notis/config', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function fetchTelegramChats(token: string): Promise<{ chats: TgChat[] }> {
  return apiFetch('/api/notis/telegram/chats', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function testTelegram(): Promise<{ ok: boolean }> {
  return apiFetch('/api/notis/telegram/test', { method: 'POST' });
}
