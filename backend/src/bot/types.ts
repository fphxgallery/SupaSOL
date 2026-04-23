export type TrendingInterval = '5m' | '1h' | '6h' | '24h';

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
  mcapMin: number;
  mcapMax: number;
  skipSus: boolean;
  skipMintable: boolean;
  skipFreezable: boolean;
  maxPriceImpactPct: number;
  slippageBps: number;
  trailingStopPct: number;
  takeProfitPct: number;
  maxHoldMinutes: number;
  rebuyCooldownMinutes: number;
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
  rebuyCooldownMinutes: 60,
  aiEnabled: false,
  aiMode: 'veto',
  aiModel: 'gpt-4o-mini',
  aiMinConfidence: 60,
  aiMaxCallsPerHour: 100,
  aiCacheMinutes: 10,
  aiExitLossPct: 10,
  aiExitGainPct: 30,
};
