import { useFrontendLogStore, type FrontendLogLevel } from '../store/frontendLogStore';

function fmtArg(a: unknown): string {
  if (a == null) return String(a);
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack ?? a.message;
  try { return JSON.stringify(a); } catch { return String(a); }
}

function fmt(args: unknown[]): string {
  return args.map(fmtArg).join(' ');
}

let installed = false;

export function installFrontendLogCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const push = (level: FrontendLogLevel, msg: string, source?: string) => {
    useFrontendLogStore.getState().push({ level, msg, source });
  };

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log  = (...args: unknown[]) => { push('log',  fmt(args)); orig.log(...args); };
  console.info = (...args: unknown[]) => { push('info', fmt(args)); orig.info(...args); };
  console.warn = (...args: unknown[]) => { push('warn', fmt(args)); orig.warn(...args); };
  console.error = (...args: unknown[]) => { push('error', fmt(args)); orig.error(...args); };

  window.addEventListener('error', (e) => {
    const src = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined;
    const msg = e.error?.stack ?? e.message ?? 'Unknown error';
    push('error', msg, src);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = reason instanceof Error
      ? (reason.stack ?? reason.message)
      : (typeof reason === 'string' ? reason : JSON.stringify(reason));
    push('error', `Unhandled rejection: ${msg}`);
  });
}
