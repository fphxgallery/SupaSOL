import { VersionedTransaction, Keypair } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import * as botState from './state';
import { getSwapOrder, executeSwap, fetchTrendingTokens, fetchPrices } from '../lib/jupiterApi';
import { getTradeDecision, resetAdvisorState } from './aiAdvisor';
import type { BotConfig } from './types';
import { SOL_MINT } from './types';

let secretKey: Uint8Array | null = null;
let entryTimer: ReturnType<typeof setInterval> | null = null;
let exitTimer: ReturnType<typeof setInterval> | null = null;
let entryLoopRunning = false;
let exitLoopRunning = false;

export function isRunning() { return entryTimer !== null; }

export function getPubkey(): string | null {
  if (!secretKey) return null;
  try { return Keypair.fromSecretKey(secretKey).publicKey.toBase58(); } catch { return null; }
}

async function runEntryLoop() {
  if (entryLoopRunning || !secretKey) return;
  entryLoopRunning = true;
  try {
    const { config } = botState.getState();
    const keypair = Keypair.fromSecretKey(secretKey);
    const pubkey = keypair.publicKey.toBase58();

    const openPositions = botState.getPositions().filter((p) => p.status === 'open');
    if (openPositions.length >= config.maxPositions) return;

    let tokens: Awaited<ReturnType<typeof fetchTrendingTokens>>;
    try { tokens = await fetchTrendingTokens(config.interval); } catch { return; }

    const openMints = new Set(openPositions.map((p) => p.mint));

    const now = Date.now();
    const cooldownMs = config.rebuyCooldownMinutes * 60_000;
    const recentlyExited = new Set(
      botState.getState().closedPositions
        .filter((p) => now - p.exitTime < cooldownMs)
        .map((p) => p.mint)
    );

    const sorted = [...tokens].sort((a, b) => (b.organicScore ?? 0) - (a.organicScore ?? 0));

    for (const token of sorted) {
      const currentOpen = botState.getPositions().filter((p) => p.status === 'open').length;
      if (currentOpen >= config.maxPositions) break;
      if (openMints.has(token.address)) continue;
      if (recentlyExited.has(token.address)) continue;
      if (!token.usdPrice) continue;

      if (config.skipSus && token.audit?.isSus) continue;
      if (config.skipMintable && token.audit?.isMintable) continue;
      if (config.skipFreezable && token.audit?.isFreezable) continue;
      if ((token.organicScore ?? 0) < config.minOrganicScore) continue;

      const mcap = token.mcap ?? 0;
      if (config.mcapMax > 0 && mcap > config.mcapMax) continue;
      if (config.mcapMin > 0 && mcap < config.mcapMin) continue;

      const stats = token.stats[config.interval];
      if (!stats) continue;
      const priceChange = stats.priceChange ?? -Infinity;
      if (priceChange < config.minPriceChangePct) continue;
      if (config.maxPriceChangePct > 0 && priceChange > config.maxPriceChangePct) continue;
      if ((stats.numOrganicBuyers ?? 0) < config.minOrganicBuyers) continue;

      if (config.aiEnabled) {
        const decision = await getTradeDecision(
          { kind: 'entry', token },
          { model: config.aiModel, maxCallsPerHour: config.aiMaxCallsPerHour, cacheMinutes: config.aiCacheMinutes },
        );
        if ('error' in decision) {
          if (config.aiMode === 'confirm') {
            botState.addLog({ type: 'skip', message: `${token.symbol}: AI unavailable (${decision.error}), confirm mode skips` });
            continue;
          }
          botState.addLog({ type: 'info', message: `${token.symbol}: AI unavailable (${decision.error}), proceeding without AI` });
        } else {
          const tag = decision.cached ? ' (cached)' : '';
          const summary = `${token.symbol} AI: ${decision.action} @${decision.confidence}%${tag} — ${decision.reason}`;
          if (config.aiMode === 'advisory') {
            botState.addLog({ type: 'info', message: summary });
          } else if (config.aiMode === 'veto') {
            const blocks = decision.action === 'skip' || decision.action === 'sell' ||
              ((decision.action === 'hold') && decision.confidence >= config.aiMinConfidence);
            if (blocks) {
              botState.addLog({ type: 'skip', message: `AI veto ${summary}` });
              continue;
            }
            botState.addLog({ type: 'info', message: summary });
          } else {
            const confirmed = decision.action === 'buy' && decision.confidence >= config.aiMinConfidence;
            if (!confirmed) {
              botState.addLog({ type: 'skip', message: `AI no-confirm ${summary}` });
              continue;
            }
            botState.addLog({ type: 'info', message: `AI confirm ${summary}` });
          }
        }
      }

      try {
        const order = await getSwapOrder({
          inputMint: SOL_MINT,
          outputMint: token.address,
          amount: Math.floor(config.buyAmountSol * 1e9),
          userPublicKey: pubkey,
          slippageBps: config.slippageBps,
        });

        const impact = parseFloat(order.priceImpactPct ?? '0');
        if (impact > config.maxPriceImpactPct) {
          botState.addLog({ type: 'skip', message: `${token.symbol}: price impact ${impact.toFixed(2)}% exceeds ${config.maxPriceImpactPct}% limit` });
          continue;
        }

        const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
        tx.sign([keypair]);
        const signed = Buffer.from(tx.serialize()).toString('base64');
        const result = await executeSwap(signed, order.requestId);

        if (result.status !== 'Success') {
          botState.addLog({ type: 'error', message: `Buy ${token.symbol} failed: ${result.error ?? 'unknown'}` });
          continue;
        }
        if (!result.signature) {
          botState.addLog({ type: 'error', message: `Buy ${token.symbol}: no signature returned` });
          continue;
        }

        const tokenAmountOut = Number(result.outputAmountResult ?? order.outAmount);
        botState.addPosition({
          id: randomUUID(),
          mint: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
          entryPrice: token.usdPrice,
          entryTime: Date.now(),
          entryTxSig: result.signature,
          amountSolIn: config.buyAmountSol,
          tokenAmountOut,
          peakPrice: token.usdPrice,
          trailingStopPrice: token.usdPrice * (1 - config.trailingStopPct / 100),
          status: 'open',
        });
        botState.addLog({
          type: 'buy',
          message: `Bought ${token.symbol} @ $${token.usdPrice.toFixed(6)} — ${config.buyAmountSol} SOL in`,
          txSig: result.signature,
        });
        openMints.add(token.address);
      } catch (err) {
        botState.addLog({ type: 'error', message: `Buy ${token.symbol} error: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  } finally {
    entryLoopRunning = false;
  }
}

async function runExitLoop() {
  if (exitLoopRunning || !secretKey) return;
  exitLoopRunning = true;
  try {
    const { config } = botState.getState();
    const keypair = Keypair.fromSecretKey(secretKey);
    const pubkey = keypair.publicKey.toBase58();

    const openPositions = botState.getPositions().filter((p) => p.status === 'open');
    if (openPositions.length === 0) return;

    let prices: Awaited<ReturnType<typeof fetchPrices>>;
    try { prices = await fetchPrices(openPositions.map((p) => p.mint)); } catch { return; }

    const now = Date.now();

    for (const position of openPositions) {
      const currentPrice = prices[position.mint]?.usdPrice;
      if (!currentPrice) continue;

      let { peakPrice, trailingStopPrice } = position;
      if (currentPrice > peakPrice) {
        peakPrice = currentPrice;
        trailingStopPrice = peakPrice * (1 - config.trailingStopPct / 100);
        botState.updatePosition(position.id, { peakPrice, trailingStopPrice });
      }

      const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      const heldMinutes = (now - position.entryTime) / 60_000;

      let exitReason: string | null = null;
      if (currentPrice <= trailingStopPrice)       exitReason = `trailing stop (${config.trailingStopPct}% from peak $${peakPrice.toFixed(6)})`;
      else if (pnlPct >= config.takeProfitPct)     exitReason = `take profit +${pnlPct.toFixed(1)}%`;
      else if (heldMinutes >= config.maxHoldMinutes) exitReason = `max hold ${config.maxHoldMinutes}m`;

      if (!exitReason && config.aiEnabled && config.aiMode !== 'advisory') {
        const decision = await getTradeDecision(
          {
            kind: 'exit',
            mint: position.mint,
            symbol: position.symbol,
            entryPrice: position.entryPrice,
            currentPrice,
            peakPrice,
            pnlPct,
            heldMinutes,
          },
          { model: config.aiModel, maxCallsPerHour: config.aiMaxCallsPerHour, cacheMinutes: config.aiCacheMinutes },
        );
        if (!('error' in decision)) {
          const tag = decision.cached ? ' (cached)' : '';
          if (decision.action === 'sell' && decision.confidence >= config.aiMinConfidence) {
            exitReason = `AI sell @${decision.confidence}%${tag} — ${decision.reason}`;
          } else {
            botState.addLog({ type: 'info', message: `${position.symbol} AI: ${decision.action} @${decision.confidence}%${tag} — ${decision.reason}` });
          }
        }
      } else if (!exitReason && config.aiEnabled && config.aiMode === 'advisory') {
        const decision = await getTradeDecision(
          {
            kind: 'exit',
            mint: position.mint,
            symbol: position.symbol,
            entryPrice: position.entryPrice,
            currentPrice,
            peakPrice,
            pnlPct,
            heldMinutes,
          },
          { model: config.aiModel, maxCallsPerHour: config.aiMaxCallsPerHour, cacheMinutes: config.aiCacheMinutes },
        );
        if (!('error' in decision)) {
          const tag = decision.cached ? ' (cached)' : '';
          botState.addLog({ type: 'info', message: `${position.symbol} AI (advisory): ${decision.action} @${decision.confidence}%${tag} — ${decision.reason}` });
        }
      }

      if (!exitReason) continue;
      botState.updatePosition(position.id, { status: 'closing' });

      try {
        const order = await getSwapOrder({
          inputMint: position.mint,
          outputMint: SOL_MINT,
          amount: position.tokenAmountOut,
          userPublicKey: pubkey,
          slippageBps: config.slippageBps,
          swapMode: 'ExactIn',
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
        tx.sign([keypair]);
        const signed = Buffer.from(tx.serialize()).toString('base64');
        const result = await executeSwap(signed, order.requestId);

        if (result.status === 'Success') {
          const solReturned = Number(result.outputAmountResult ?? order.outAmount) / 1e9;
          botState.addClosedPosition({
            id: position.id, mint: position.mint, symbol: position.symbol,
            entryPrice: position.entryPrice, exitPrice: currentPrice,
            amountSolIn: position.amountSolIn, solReturned,
            pnlSol: solReturned - position.amountSolIn, pnlPct, exitReason,
            entryTime: position.entryTime, exitTime: Date.now(),
            entryTxSig: position.entryTxSig, exitTxSig: result.signature,
          });
          botState.removePosition(position.id);
          botState.addLog({ type: 'sell', message: `Sold ${position.symbol} — ${exitReason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, txSig: result.signature });
        } else {
          botState.updatePosition(position.id, { status: 'open' });
          botState.addLog({ type: 'error', message: `Sell ${position.symbol} failed: ${result.error ?? 'unknown'}` });
        }
      } catch (err) {
        botState.updatePosition(position.id, { status: 'open' });
        botState.addLog({ type: 'error', message: `Sell ${position.symbol} error: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  } finally {
    exitLoopRunning = false;
  }
}

export async function closeAllPositions(reason = 'bot stopped') {
  if (!secretKey) return;
  const keypair = Keypair.fromSecretKey(secretKey);
  const pubkey = keypair.publicKey.toBase58();
  const { config } = botState.getState();

  const openPositions = botState.getPositions().filter((p) => p.status === 'open');
  if (openPositions.length === 0) return;

  let prices: Awaited<ReturnType<typeof fetchPrices>>;
  try { prices = await fetchPrices(openPositions.map((p) => p.mint)); }
  catch { botState.addLog({ type: 'error', message: 'Failed to fetch prices for close-all' }); return; }

  for (const position of openPositions) {
    const currentPrice = prices[position.mint]?.usdPrice ?? position.entryPrice;
    const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    botState.updatePosition(position.id, { status: 'closing' });
    try {
      const order = await getSwapOrder({
        inputMint: position.mint, outputMint: SOL_MINT,
        amount: position.tokenAmountOut, userPublicKey: pubkey,
        slippageBps: config.slippageBps, swapMode: 'ExactIn',
      });
      const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
      tx.sign([keypair]);
      const result = await executeSwap(Buffer.from(tx.serialize()).toString('base64'), order.requestId);

      if (result.status === 'Success') {
        const solReturned = Number(result.outputAmountResult ?? order.outAmount) / 1e9;
        botState.addClosedPosition({
          id: position.id, mint: position.mint, symbol: position.symbol,
          entryPrice: position.entryPrice, exitPrice: currentPrice,
          amountSolIn: position.amountSolIn, solReturned,
          pnlSol: solReturned - position.amountSolIn, pnlPct, exitReason: reason,
          entryTime: position.entryTime, exitTime: Date.now(),
          entryTxSig: position.entryTxSig, exitTxSig: result.signature,
        });
        botState.removePosition(position.id);
        botState.addLog({ type: 'sell', message: `Sold ${position.symbol} — ${reason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, txSig: result.signature });
      } else {
        botState.updatePosition(position.id, { status: 'open' });
        botState.addLog({ type: 'error', message: `Sell ${position.symbol} failed: ${result.error ?? 'unknown'}` });
      }
    } catch (err) {
      botState.updatePosition(position.id, { status: 'open' });
      botState.addLog({ type: 'error', message: `Sell ${position.symbol} error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}

export function start(key: Uint8Array, configOverrides: Partial<BotConfig> = {}) {
  if (isRunning()) stop();
  secretKey = key;
  botState.setConfig({ ...configOverrides, enabled: true });
  botState.addLog({ type: 'info', message: 'Background bot started' });

  const pollIntervalMs = botState.getState().config.pollIntervalMs;
  runEntryLoop();
  runExitLoop();
  entryTimer = setInterval(runEntryLoop, pollIntervalMs);
  exitTimer = setInterval(runExitLoop, 10_000);
}

export function stop() {
  if (entryTimer) { clearInterval(entryTimer); entryTimer = null; }
  if (exitTimer)  { clearInterval(exitTimer);  exitTimer  = null; }
  resetAdvisorState();
  secretKey = null;
  botState.setConfig({ enabled: false });
  botState.addLog({ type: 'info', message: 'Background bot stopped' });
}
