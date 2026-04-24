import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

const STATE_DIR = process.env['BOT_STATE_DIR'] ?? process.cwd();
const NOTIS_PATH = path.join(STATE_DIR, 'notis.json');

export type NotisEvent =
  | 'bot.entry'
  | 'bot.exit'
  | 'bot.veto'
  | 'bot.start'
  | 'bot.stop'
  | 'bot.error';

export const ALL_EVENTS: NotisEvent[] = [
  'bot.entry', 'bot.exit', 'bot.veto', 'bot.start', 'bot.stop', 'bot.error',
];

interface TelegramConfig {
  enabled: boolean;
  token: string;
  chatId: string;
  events: Record<NotisEvent, boolean>;
}

interface NotisConfig {
  telegram: TelegramConfig;
  lastSend?: { ok: boolean; ts: number; error?: string };
}

function defaultEvents(): Record<NotisEvent, boolean> {
  return ALL_EVENTS.reduce((acc, e) => { acc[e] = true; return acc; }, {} as Record<NotisEvent, boolean>);
}

function defaultConfig(): NotisConfig {
  return {
    telegram: { enabled: false, token: '', chatId: '', events: defaultEvents() },
  };
}

let config: NotisConfig = defaultConfig();

try {
  if (fs.existsSync(NOTIS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(NOTIS_PATH, 'utf8')) as Partial<NotisConfig>;
    const tg = (raw.telegram ?? {}) as Partial<TelegramConfig>;
    config = {
      telegram: {
        enabled: tg.enabled ?? false,
        token: tg.token ?? '',
        chatId: tg.chatId ?? '',
        events: { ...defaultEvents(), ...(tg.events ?? {}) },
      },
      lastSend: raw.lastSend,
    };
  }
} catch {
  // ignore — use defaults
}

function persist() {
  try {
    atomicWriteFileSync(NOTIS_PATH, JSON.stringify(config));
  } catch (e) {
    console.error('[notis] save failed:', e);
  }
}

function maskToken(t: string): string {
  if (!t) return '';
  if (t.length <= 8) return '****';
  return `****${t.slice(-4)}`;
}

export function getConfig() {
  return {
    telegram: {
      enabled: config.telegram.enabled,
      tokenMasked: maskToken(config.telegram.token),
      hasToken: !!config.telegram.token,
      chatId: config.telegram.chatId,
      events: config.telegram.events,
    },
    lastSend: config.lastSend,
  };
}

export interface UpdatePayload {
  telegram?: Partial<Omit<TelegramConfig, 'events'>> & { events?: Partial<Record<NotisEvent, boolean>> };
}

export function updateConfig(payload: UpdatePayload) {
  if (payload.telegram) {
    const t = payload.telegram;
    if (typeof t.enabled === 'boolean') config.telegram.enabled = t.enabled;
    if (typeof t.token === 'string') config.telegram.token = t.token.trim();
    if (typeof t.chatId === 'string') config.telegram.chatId = t.chatId.trim();
    if (t.events) {
      for (const k of Object.keys(t.events) as NotisEvent[]) {
        if (ALL_EVENTS.includes(k) && typeof t.events[k] === 'boolean') {
          config.telegram.events[k] = t.events[k]!;
        }
      }
    }
  }
  persist();
}

async function tgApi<T>(token: string, method: string, body?: unknown): Promise<T> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description || `Telegram ${method} failed`);
  return json.result as T;
}

interface TgUpdate {
  message?: { chat: { id: number; title?: string; username?: string; first_name?: string; type: string } };
  channel_post?: { chat: { id: number; title?: string; type: string } };
  my_chat_member?: { chat: { id: number; title?: string; username?: string; type: string } };
}

export interface TgChat {
  id: string;
  label: string;
  type: string;
}

export async function fetchTelegramChats(token: string): Promise<TgChat[]> {
  const updates = await tgApi<TgUpdate[]>(token, 'getUpdates', { timeout: 0, limit: 100 });
  const map = new Map<string, TgChat>();
  for (const u of updates) {
    const chat = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
    if (!chat) continue;
    const id = String(chat.id);
    if (map.has(id)) continue;
    const label =
      chat.title ||
      (chat as { username?: string }).username ||
      (chat as { first_name?: string }).first_name ||
      id;
    map.set(id, { id, label, type: chat.type });
  }
  return [...map.values()];
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await tgApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

export async function testTelegram(): Promise<void> {
  const { token, chatId } = config.telegram;
  if (!token || !chatId) throw new Error('Token and chat required');
  await sendTelegram(token, chatId, '✅ <b>SupaSOL</b> test notification');
  config.lastSend = { ok: true, ts: Date.now() };
  persist();
}

export function notify(event: NotisEvent, text: string): void {
  const tg = config.telegram;
  if (!tg.enabled || !tg.token || !tg.chatId) return;
  if (!tg.events[event]) return;
  sendTelegram(tg.token, tg.chatId, text)
    .then(() => {
      config.lastSend = { ok: true, ts: Date.now() };
      persist();
    })
    .catch((err: Error) => {
      config.lastSend = { ok: false, ts: Date.now(), error: err.message };
      persist();
      console.error('[notis] send failed:', err.message);
    });
}

export function formatEntry(p: { symbol: string; price: number; amountSol: number; txSig?: string }) {
  const link = p.txSig ? `\n<a href="https://solscan.io/tx/${p.txSig}">tx</a>` : '';
  return `🟢 <b>BUY</b> ${p.symbol} @ $${p.price.toFixed(6)} — ${p.amountSol} SOL${link}`;
}

export function formatExit(p: { symbol: string; price: number; pnlPct: number; reason: string; txSig?: string }) {
  const emoji = p.pnlPct >= 0 ? '🟢' : '🔴';
  const sign = p.pnlPct >= 0 ? '+' : '';
  const link = p.txSig ? `\n<a href="https://solscan.io/tx/${p.txSig}">tx</a>` : '';
  return `${emoji} <b>SELL</b> ${p.symbol} @ $${p.price.toFixed(6)} — ${sign}${p.pnlPct.toFixed(2)}%\n${p.reason}${link}`;
}

export function formatVeto(p: { symbol: string; confidence: number; reason: string }) {
  return `⛔ <b>VETO</b> ${p.symbol} @${p.confidence}%\n${p.reason}`;
}

export function formatError(msg: string) {
  return `⚠️ <b>ERROR</b>\n${msg}`;
}

export function formatBotStart(pubkey: string) {
  return `▶️ <b>Bot started</b>\n<code>${pubkey}</code>`;
}

export function formatBotStop(reason: string) {
  return `⏹ <b>Bot stopped</b>\n${reason}`;
}
