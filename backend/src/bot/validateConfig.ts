import type { BotConfig, TrendingInterval, AiMode, AiModel } from './types';

const INTERVALS: TrendingInterval[] = ['5m', '1h', '6h', '24h'];
const AI_MODES: AiMode[] = ['veto', 'confirm', 'advisory'];
const AI_MODELS: AiModel[] = ['gpt-4o-mini', 'gpt-4o'];

type Rule =
  | { kind: 'bool' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'num'; min?: number; max?: number; int?: boolean; finite?: boolean };

const RULES: Record<keyof BotConfig, Rule> = {
  enabled: { kind: 'bool' },
  interval: { kind: 'enum', values: INTERVALS },
  pollIntervalMs: { kind: 'num', int: true, min: 1_000, max: 3_600_000 },
  buyAmountSol: { kind: 'num', min: 0, max: 1_000 }, // exclusive-0 enforced below
  maxPositions: { kind: 'num', int: true, min: 1, max: 100 },
  minOrganicScore: { kind: 'num', min: 0, max: 100 },
  minPriceChangePct: { kind: 'num', finite: true },
  maxPriceChangePct: { kind: 'num', finite: true },
  minOrganicBuyers: { kind: 'num', int: true, min: 0, max: 1_000_000 },
  mcapMin: { kind: 'num', min: 0, max: 1e15 },
  mcapMax: { kind: 'num', min: 0, max: 1e15 },
  skipSus: { kind: 'bool' },
  skipMintable: { kind: 'bool' },
  skipFreezable: { kind: 'bool' },
  maxPriceImpactPct: { kind: 'num', min: 0, max: 100 },
  slippageBps: { kind: 'num', int: true, min: 0, max: 10_000 },
  trailingStopPct: { kind: 'num', min: 0, max: 100 },
  takeProfitPct: { kind: 'num', min: 0, max: 100_000 },
  maxHoldMinutes: { kind: 'num', min: 0, max: 1_000_000 },
  rebuyCooldownMinutes: { kind: 'num', min: 0, max: 1_000_000 },
  aiEnabled: { kind: 'bool' },
  aiMode: { kind: 'enum', values: AI_MODES },
  aiModel: { kind: 'enum', values: AI_MODELS },
  aiMinConfidence: { kind: 'num', min: 0, max: 100 },
  aiMaxCallsPerHour: { kind: 'num', int: true, min: 0, max: 100_000 },
  aiCacheMinutes: { kind: 'num', min: 0, max: 1_440 },
  aiExitLossPct: { kind: 'num', min: 0, max: 100 },
  aiExitGainPct: { kind: 'num', min: 0, max: 100_000 },
};

export type ValidationError = { field: string; message: string };

export function validateBotConfigPatch(
  input: unknown,
): { ok: true; value: Partial<BotConfig> } | { ok: false; error: ValidationError } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: { field: '_root', message: 'body must be an object' } };
  }
  const out: Record<string, unknown> = {};
  const src = input as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (!(key in RULES)) {
      return { ok: false, error: { field: key, message: `unknown field` } };
    }
    const rule = RULES[key as keyof BotConfig];
    const v = src[key];

    if (rule.kind === 'bool') {
      if (typeof v !== 'boolean') return { ok: false, error: { field: key, message: 'must be boolean' } };
    } else if (rule.kind === 'enum') {
      if (typeof v !== 'string' || !rule.values.includes(v)) {
        return { ok: false, error: { field: key, message: `must be one of ${rule.values.join(', ')}` } };
      }
    } else {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return { ok: false, error: { field: key, message: 'must be a finite number' } };
      }
      if (rule.int && !Number.isInteger(v)) {
        return { ok: false, error: { field: key, message: 'must be an integer' } };
      }
      if (rule.min !== undefined && v < rule.min) {
        return { ok: false, error: { field: key, message: `must be >= ${rule.min}` } };
      }
      if (rule.max !== undefined && v > rule.max) {
        return { ok: false, error: { field: key, message: `must be <= ${rule.max}` } };
      }
    }
    out[key] = v;
  }

  // Exclusive-zero: buyAmountSol must be strictly > 0
  if ('buyAmountSol' in out && (out['buyAmountSol'] as number) <= 0) {
    return { ok: false, error: { field: 'buyAmountSol', message: 'must be > 0' } };
  }

  // Cross-field: mcapMin <= mcapMax when both provided
  if ('mcapMin' in out && 'mcapMax' in out) {
    const lo = out['mcapMin'] as number;
    const hi = out['mcapMax'] as number;
    if (hi > 0 && lo > hi) {
      return { ok: false, error: { field: 'mcapMin', message: 'mcapMin must be <= mcapMax' } };
    }
  }

  return { ok: true, value: out as Partial<BotConfig> };
}
