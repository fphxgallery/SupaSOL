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
  minOrganicBuyers: number;
  mcapMin: number;
  mcapMax: number; // 0 = unlimited
  skipSus: boolean;
  skipMintable: boolean;
  skipFreezable: boolean;
  maxPriceImpactPct: number;
  slippageBps: number;
  trailingStopPct: number;
  takeProfitPct: number;
  maxHoldMinutes: number;
}

export interface BotPosition {
  id: string;
  mint: string;
  symbol: string;
  decimals: number;
  entryPrice: number;
  entryTime: number;
  entryTxSig: string;
  amountSolIn: number;
  tokenAmountOut: number; // base units
  peakPrice: number;
  trailingStopPrice: number;
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
  minOrganicBuyers: 3,
  mcapMin: 0,
  mcapMax: 10_000_000,
  skipSus: true,
  skipMintable: true,
  skipFreezable: false,
  maxPriceImpactPct: 3,
  slippageBps: 100,
  trailingStopPct: 20,
  takeProfitPct: 50,
  maxHoldMinutes: 60,
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
    { name: 'ftb-bot' }
  )
);
