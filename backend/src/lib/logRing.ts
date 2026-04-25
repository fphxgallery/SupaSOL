export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  scope: string;
  msg: string;
  meta?: string;
}

const MAX = 2000;
const ring: LogEntry[] = [];

function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pushLog(level: LogLevel, scope: string, msg: string, meta?: unknown): void {
  let metaStr: string | undefined;
  if (meta !== undefined) {
    if (meta instanceof Error) metaStr = meta.stack ?? meta.message;
    else {
      try { metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta); }
      catch { metaStr = '[unserializable]'; }
    }
  }
  ring.unshift({ id: nextId(), ts: Date.now(), level, scope, msg, meta: metaStr });
  if (ring.length > MAX) ring.length = MAX;
}

export function getLogs(sinceTs?: number, limit = 500): LogEntry[] {
  const filtered = sinceTs ? ring.filter((e) => e.ts > sinceTs) : ring;
  return filtered.slice(0, limit);
}

export function clearLogs(): void {
  ring.length = 0;
}
