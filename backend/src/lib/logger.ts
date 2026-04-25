import { pushLog } from './logRing';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (process.env['LOG_LEVEL'] ?? '').toLowerCase() as Level | '';
const threshold = LEVELS[envLevel as Level] ?? (process.env['NODE_ENV'] === 'production' ? LEVELS.info : LEVELS.debug);

function fmt(level: Level, scope: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const base = `${ts} ${level.toUpperCase()} [${scope}] ${msg}`;
  if (meta === undefined) return base;
  if (meta instanceof Error) return `${base} — ${meta.message}${meta.stack ? `\n${meta.stack}` : ''}`;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return `${base} [unserializable meta]`;
  }
}

function emit(level: Level, scope: string, msg: string, meta?: unknown) {
  if (LEVELS[level] < threshold) return;
  const line = fmt(level, scope, msg, meta);
  const sink = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  sink.write(line + '\n');
  pushLog(level, scope, msg, meta);
}

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, meta) => emit('debug', scope, msg, meta),
    info: (msg, meta) => emit('info', scope, msg, meta),
    warn: (msg, meta) => emit('warn', scope, msg, meta),
    error: (msg, meta) => emit('error', scope, msg, meta),
  };
}
