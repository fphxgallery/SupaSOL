export type TrendingInterval = '5m' | '1h' | '6h' | '24h';
export type AfterT1Mode = 'breakeven' | 'tighten';

export interface BotConfig {
  enabled: boolean;
  interval: TrendingInterval;
  pollIntervalMs: number;
  buyAmountSol: number;
  maxPositions: number;
  minOrganicScore: number;
  minPriceChangePct: number;
  maxPriceChangePct: number;
  minOrganicBuyers: number;
  minTokenAgeHours: number;
  mcapMin: number;
  mcapMax: number;
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

export interface BotPosition {
  id: string;
  mint: string;
  symbol: string;
  decimals: number;
  entryPrice: number;
  entryTime: number;
  entryTxSig: string;
  amountSolIn: number;
  tokenAmountOut: number;
  tokenAmountRemaining: number;
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
  exitReason: string;
  entryTime: number;
  exitTime: number;
  entryTxSig: string;
  exitTxSig?: string;
  tier?: number;
}

export const SOL_MINT = 'So11111111111111111111111111111111111111112';

export const DEFAULT_CONFIG: BotConfig = {
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
