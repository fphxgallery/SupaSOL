import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendingInterval } from '../hooks/useTrendingTokens';

export interface BotConfig {
  enabled: boolean;
  interval: TrendingInterval;
  pollIntervalMs: number;
  buyAmountSol: number;
  maxPositions: number;
  minOrganicScore: number;
  minPriceChangePct: number;
  maxPriceChangePct: number; // 0 = unlimited
  minOrganicBuyers: number;
  minTokenAgeHours: number;
  mcapMin: number;
  mcapMax: number; // 0 = unlimited
  skipSus: boolean;
  skipMintable: boolean;
  skipFreezable: boolean;
  maxPriceImpactPct: number;
  slippageBps: number;
  trailingStopPct: number;
  maxHoldMinutes: number;
  maxHoldAiGated: boolean;
  rebuyCooldownMinutes: number;
  tp1Pct: number;
  tp1SellPct: number;
  tp2Pct: number;
  tp2SellPct: number;
  afterT1Mode: AfterT1Mode;
  tightTrailPct: number;
  aiEnabled: boolean;
  aiMode: AiMode;
  aiModel: AiModel;
  aiMinConfidence: number;
  aiMaxCallsPerHour: number;
  aiCacheMinutes: number;
  aiExitLossPct: number;
  aiExitGainPct: number;
}

export type AiMode = 'veto' | 'confirm' | 'advisory';
export type AiModel = 'gpt-4o-mini' | 'gpt-4o';
export type AfterT1Mode = 'breakeven' | 'tighten';

export interface BotPosition {
  id: string;
  mint: string;
  symbol: string;
  decimals: number;
  entryPrice: number;
  entryTime: number;
  entryTxSig: string;
  amountSolIn: number;
  tokenAmountOut: number; // base units — initial
  tokenAmountRemaining: number; // base units — unsold
  tiersHit: number[];
  peakPrice: number;
  peakPnlPct: number;
  trailingStopPrice: number;
  breakevenFloor?: number;
  status: 'open' | 'closing';
}

export interface BotLogEntry {
  id: string;
  time: number;
  type: 'buy' | 'sell' | 'skip' | 'error' | 'info';
  message: string;
  txSig?: string;
}

export interface ClosedPosition {
  id: string;
  mint: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  amountSolIn: number;
  solReturned: number;
  pnlSol: number;
  pnlPct: number;
  peakPnlPct: number;
  tier?: number;
  exitReason: string;
  entryTime: number;
  exitTime: number;
  entryTxSig: string;
  exitTxSig?: string;
}

const DEFAULT_CONFIG: BotConfig = {
  enabled: false,
  interval: '5m',
  pollIntervalMs: 60_000,
  buyAmountSol: 0.1,
  maxPositions: 3,
  minOrganicScore: 70,
  minPriceChangePct: 5,
  maxPriceChangePct: 0,
  minOrganicBuyers: 3,
  minTokenAgeHours: 0,
  mcapMin: 0,
  mcapMax: 10_000_000,
  skipSus: true,
  skipMintable: true,
  skipFreezable: false,
  maxPriceImpactPct: 3,
  slippageBps: 100,
  trailingStopPct: 20,
  maxHoldMinutes: 60,
  maxHoldAiGated: true,
  rebuyCooldownMinutes: 60,
  tp1Pct: 30,
  tp1SellPct: 50,
  tp2Pct: 60,
  tp2SellPct: 50,
  afterT1Mode: 'breakeven',
  tightTrailPct: 10,
  aiEnabled: false,
  aiMode: 'veto',
  aiModel: 'gpt-4o-mini',
  aiMinConfidence: 60,
  aiMaxCallsPerHour: 100,
  aiCacheMinutes: 10,
  aiExitLossPct: 10,
  aiExitGainPct: 30,
};

interface BotState {
  config: BotConfig;
  positions: BotPosition[];
  closedPositions: ClosedPosition[];
  log: BotLogEntry[];
  updateConfig: (updates: Partial<BotConfig>) => void;
  addPosition: (pos: BotPosition) => void;
  updatePosition: (id: string, updates: Partial<BotPosition>) => void;
  removePosition: (id: string) => void;
  addClosedPosition: (pos: ClosedPosition) => void;
  clearHistory: () => void;
  addLog: (entry: Omit<BotLogEntry, 'id' | 'time'>) => void;
  clearLog: () => void;
}

export const useBotStore = create<BotState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      positions: [],
      closedPositions: [],
      log: [],
      updateConfig: (updates) =>
        set((s) => ({ config: { ...s.config, ...updates } })),
      addPosition: (pos) =>
        set((s) => ({ positions: [...s.positions, pos] })),
      updatePosition: (id, updates) =>
        set((s) => ({
          positions: s.positions.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),
      removePosition: (id) =>
        set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),
      addClosedPosition: (pos) =>
        set((s) => ({ closedPositions: [pos, ...s.closedPositions].slice(0, 500) })),
      clearHistory: () => set({ closedPositions: [] }),
      addLog: (entry) =>
        set((s) => ({
          log: [{ ...entry, id: crypto.randomUUID(), time: Date.now() }, ...s.log].slice(0, 500),
        })),
      clearLog: () => set({ log: [] }),
    }),
    {
      name: 'ftb-bot',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BotState>;
        const positions = (p.positions ?? []).map((pos) => ({
          ...pos,
          tokenAmountRemaining: pos.tokenAmountRemaining ?? pos.tokenAmountOut,
          tiersHit: pos.tiersHit ?? [],
          peakPnlPct: pos.peakPnlPct ?? 0,
        }));
        const closedPositions = (p.closedPositions ?? []).map((cp) => ({
          ...cp,
          peakPnlPct: cp.peakPnlPct ?? cp.pnlPct,
        }));
        return {
          ...current,
          ...p,
          positions,
          closedPositions,
          config: { ...DEFAULT_CONFIG, ...(p.config ?? {}) },
        };
      },
    }
  )
);
