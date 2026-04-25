import { VersionedTransaction, Keypair } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import * as botState from './state';
import { getSwapOrder, executeSwap, fetchTrendingTokens, fetchPrices, fetchTokenStats } from '../lib/jupiterApi';
import {
  getTradeDecision,
  resetAdvisorState,
  recordRejection,
  getRejections,
  getDecisionHistory,
  recordDecisionSnapshot,
  clearDecisionHistory,
  compositeScore,
  scoreInterval,
  recordDecisionLog,
} from './aiAdvisor';
import type { BotConfig } from './types';
import { SOL_MINT } from './types';
import {
  notify,
  formatEntry,
  formatExit,
  formatVeto,
  formatError,
  formatBotStart,
  formatBotStop,
} from '../lib/notifier';

let secretKey: Uint8Array | null = null;
let entryTimer: ReturnType<typeof setInterval> | null = null;
let exitTimer: ReturnType<typeof setInterval> | null = null;
let entryLoopRunning = false;
let exitLoopRunning = false;
const aiRejectedUntil = new Map<string, number>();

function historyForMint(mint: string) {
  return botState.getState().closedPositions.filter((p) => p.mint === mint);
}

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

      if (config.minTokenAgeHours > 0 && token.createdAt) {
        const ageHours = (now - token.createdAt) / 3_600_000;
        if (ageHours < config.minTokenAgeHours) continue;
      }

      if (config.aiEnabled) {
        const rejectedExp = aiRejectedUntil.get(token.address);
        if (rejectedExp && rejectedExp > now) continue;
        if (rejectedExp) aiRejectedUntil.delete(token.address);

        const decision = await getTradeDecision(
          { kind: 'entry', token, history: historyForMint(token.address), rejections: getRejections(token.address) },
          { model: config.aiModel, maxCallsPerHour: config.aiMaxCallsPerHour, cacheMinutes: config.aiCacheMinutes },
        );
        if ('error' in decision) {
          recordDecisionLog({
            kind: 'entry', mint: token.address, symbol: token.symbol,
            action: 'skip', confidence: 0, reason: `AI unavailable: ${decision.error}`,
            cached: false, tokensUsed: 0, mode: config.aiMode,
            outcome: 'unavailable', error: decision.error,
          });
          if (config.aiMode === 'confirm') {
            botState.addLog({ type: 'skip', message: `${token.symbol}: AI unavailable (${decision.error}), confirm mode skips` });
            continue;
          }
          botState.addLog({ type: 'info', message: `${token.symbol}: AI unavailable (${decision.error}), proceeding without AI` });
        } else {
          const tag = decision.cached ? ' (cached)' : '';
          const summary = `${token.symbol} AI: ${decision.action} @${decision.confidence}%${tag} — ${decision.reason}`;
          let outcome: 'buy' | 'veto' | 'no-confirm' | 'advisory';
          if (config.aiMode === 'advisory') {
            outcome = 'advisory';
            botState.addLog({ type: 'info', message: summary });
          } else if (config.aiMode === 'veto') {
            const blocks = decision.action === 'skip' || decision.action === 'sell' ||
              ((decision.action === 'hold') && decision.confidence >= config.aiMinConfidence);
            if (blocks) {
              aiRejectedUntil.set(token.address, now + config.aiCacheMinutes * 60_000);
              recordRejection(token.address, { action: decision.action, confidence: decision.confidence, reason: decision.reason });
              botState.addLog({ type: 'skip', message: `AI veto ${summary}` });
              notify('bot.veto', formatVeto({ symbol: token.symbol, confidence: decision.confidence, reason: decision.reason }));
              recordDecisionLog({
                kind: 'entry', mint: token.address, symbol: token.symbol,
                action: decision.action, confidence: decision.confidence, reason: decision.reason,
                cached: decision.cached, tokensUsed: decision.tokensUsed, mode: config.aiMode,
                outcome: 'veto', gate: config.aiMinConfidence,
              });
              continue;
            }
            outcome = 'buy';
            botState.addLog({ type: 'info', message: summary });
          } else {
            const confirmed = decision.action === 'buy' && decision.confidence >= config.aiMinConfidence;
            if (!confirmed) {
              aiRejectedUntil.set(token.address, now + config.aiCacheMinutes * 60_000);
              recordRejection(token.address, { action: decision.action, confidence: decision.confidence, reason: decision.reason });
              botState.addLog({ type: 'skip', message: `AI no-confirm ${summary}` });
              recordDecisionLog({
                kind: 'entry', mint: token.address, symbol: token.symbol,
                action: decision.action, confidence: decision.confidence, reason: decision.reason,
                cached: decision.cached, tokensUsed: decision.tokensUsed, mode: config.aiMode,
                outcome: 'no-confirm', gate: config.aiMinConfidence,
              });
              continue;
            }
            outcome = 'buy';
            botState.addLog({ type: 'info', message: `AI confirm ${summary}` });
          }
          recordDecisionLog({
            kind: 'entry', mint: token.address, symbol: token.symbol,
            action: decision.action, confidence: decision.confidence, reason: decision.reason,
            cached: decision.cached, tokensUsed: decision.tokensUsed, mode: config.aiMode,
            outcome, gate: config.aiMinConfidence,
          });
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
          tokenAmountRemaining: tokenAmountOut,
          tiersHit: [],
          peakPrice: token.usdPrice,
          peakPnlPct: 0,
          trailingStopPrice: token.usdPrice * (1 - config.trailingStopPct / 100),
          status: 'open',
        });
        botState.addLog({
          type: 'buy',
          message: `Bought ${token.symbol} @ $${token.usdPrice.toFixed(6)} — ${config.buyAmountSol} SOL in`,
          txSig: result.signature,
        });
        notify('bot.entry', formatEntry({
          symbol: token.symbol, price: token.usdPrice,
          amountSol: config.buyAmountSol, txSig: result.signature,
        }));
        openMints.add(token.address);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        botState.addLog({ type: 'error', message: `Buy ${token.symbol} error: ${msg}` });
        notify('bot.error', formatError(`Buy ${token.symbol}: ${msg}`));
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

      const tiersHit = position.tiersHit ?? [];
      const afterT1 = tiersHit.includes(1);
      const afterT2 = tiersHit.includes(2);
      const activeTrailPct = (afterT1 && config.afterT1Mode === 'tighten')
        ? config.tightTrailPct
        : config.trailingStopPct;

      let { peakPrice, trailingStopPrice } = position;
      if (currentPrice > peakPrice) {
        peakPrice = currentPrice;
        const trailBase = peakPrice * (1 - activeTrailPct / 100);
        trailingStopPrice = Math.max(trailBase, position.breakevenFloor ?? 0);
        botState.updatePosition(position.id, { peakPrice, trailingStopPrice });
      }

      const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      const heldMinutes = (now - position.entryTime) / 60_000;

      const peakPnlPct = Math.max(position.peakPnlPct ?? 0, pnlPct);
      if (peakPnlPct !== position.peakPnlPct) {
        botState.updatePosition(position.id, { peakPnlPct });
      }

      // Tiered take-profit: T1 then T2
      const tier: 0 | 1 | 2 = !afterT1 && pnlPct >= config.tp1Pct ? 1
        : (afterT1 && !afterT2 && pnlPct >= config.tp2Pct) ? 2
        : 0;
      if (tier === 1 || tier === 2) {
        const sellAmount = tier === 1
          ? Math.floor(position.tokenAmountOut * config.tp1SellPct / 100)
          : Math.floor(position.tokenAmountRemaining * config.tp2SellPct / 100);
        if (sellAmount > 0 && sellAmount <= position.tokenAmountRemaining) {
          await doTierSell(position, tier, sellAmount, currentPrice, pnlPct, peakPnlPct, peakPrice, trailingStopPrice, config, keypair, pubkey);
        }
        continue;
      }

      let exitReason: string | null = null;
      const maxHoldHit = heldMinutes >= config.maxHoldMinutes;
      const maxHoldAiDefer = maxHoldHit && config.aiEnabled && config.maxHoldAiGated;
      if (currentPrice <= trailingStopPrice)          exitReason = `trailing stop (${activeTrailPct}% from peak $${peakPrice.toFixed(6)})`;
      else if (maxHoldHit && !maxHoldAiDefer)         exitReason = `max hold ${config.maxHoldMinutes}m`;

      const inLossZone = pnlPct <= -config.aiExitLossPct;
      const inGainZone = pnlPct >= config.aiExitGainPct;
      const tierGateOk = afterT2;
      // Loss-side AI advice always allowed; gain-side gated on tier completion when tiered TP enabled.
      // Max-hold cap also opens the gate when AI-gated.
      const aiExitGateOk = inLossZone || (inGainZone && tierGateOk) || maxHoldAiDefer;
      if (!exitReason && config.aiEnabled && aiExitGateOk) {
        const tokenStats = await fetchTokenStats(position.mint);
        const prevSnapshots = getDecisionHistory(position.mint);
        const exitCtx = {
          kind: 'exit' as const,
          mint: position.mint,
          symbol: position.symbol,
          entryPrice: position.entryPrice,
          currentPrice,
          peakPrice,
          pnlPct,
          heldMinutes,
          trailingStopPct: config.trailingStopPct,
          stats5m: tokenStats?.stats['5m'],
          stats1h: tokenStats?.stats['1h'],
          history: historyForMint(position.mint),
          decisionHistory: prevSnapshots,
          maxHoldHit,
          maxHoldMinutes: config.maxHoldMinutes,
        };

        const consecHolds = (() => {
          let n = 0;
          for (let i = prevSnapshots.length - 1; i >= 0; i--) {
            if (prevSnapshots[i].action === 'hold') n++;
            else break;
          }
          return n;
        })();
        const effectiveCacheMinutes = consecHolds >= 3 ? Math.min(2, config.aiCacheMinutes)
          : consecHolds >= 2 ? Math.min(5, config.aiCacheMinutes)
          : config.aiCacheMinutes;
        const aiOpts = { model: config.aiModel, maxCallsPerHour: config.aiMaxCallsPerHour, cacheMinutes: effectiveCacheMinutes };

        const lossMag = Math.max(0, -pnlPct);
        const timeDecay = Math.min(20, heldMinutes / 10);
        const lossDecay = Math.min(15, lossMag);
        const effectiveMinConf = Math.max(25, config.aiMinConfidence - timeDecay - lossDecay);

        const decision = await getTradeDecision(exitCtx, aiOpts);
        if (!('error' in decision)) {
          if ((position.aiUnavailableStreak ?? 0) > 0) {
            botState.updatePosition(position.id, { aiUnavailableStreak: 0 });
          }
          const s5 = scoreInterval(tokenStats?.stats['5m']);
          const s1 = scoreInterval(tokenStats?.stats['1h']);
          const comp = compositeScore(tokenStats?.stats['5m'], tokenStats?.stats['1h']);
          if (!decision.cached) {
            recordDecisionSnapshot(position.mint, {
              ts: Date.now(),
              action: decision.action,
              confidence: decision.confidence,
              pnlPct,
              heldMinutes,
              score5m: s5,
              score1h: s1,
              composite: comp,
            });
          }
          const gateTag = `gate=${effectiveMinConf.toFixed(0)}`;
          const compTag = `score=${(comp >= 0 ? '+' : '') + comp.toFixed(2)}`;
          let outcome: 'advisory' | 'sell' | 'hold' = 'hold';
          if (config.aiMode === 'advisory') {
            outcome = 'advisory';
            if (!decision.cached) {
              botState.addLog({ type: 'info', message: `${position.symbol} AI (advisory): ${decision.action} @${decision.confidence}% [${compTag}] — ${decision.reason}` });
            }
          } else {
            if (decision.action === 'sell' && decision.confidence >= effectiveMinConf) {
              exitReason = `AI sell @${decision.confidence}% (${gateTag}, ${compTag}) — ${decision.reason}`;
              outcome = 'sell';
            } else if (!decision.cached) {
              botState.addLog({ type: 'info', message: `${position.symbol} AI: ${decision.action} @${decision.confidence}% [${gateTag}, ${compTag}] — ${decision.reason}` });
            }
          }
          if (!decision.cached) {
            recordDecisionLog({
              kind: 'exit', mint: position.mint, symbol: position.symbol,
              action: decision.action, confidence: decision.confidence, reason: decision.reason,
              cached: decision.cached, tokensUsed: decision.tokensUsed, mode: config.aiMode,
              outcome, gate: effectiveMinConf, composite: comp, pnlPct, heldMinutes,
            });
          }
        } else {
          recordDecisionLog({
            kind: 'exit', mint: position.mint, symbol: position.symbol,
            action: 'hold', confidence: 0, reason: `AI unavailable: ${decision.error}`,
            cached: false, tokensUsed: 0, mode: config.aiMode,
            outcome: 'unavailable', pnlPct, heldMinutes, error: decision.error,
          });
          const newStreak = (position.aiUnavailableStreak ?? 0) + 1;
          botState.updatePosition(position.id, { aiUnavailableStreak: newStreak });
          // Safety net: if we deferred max-hold to AI and AI is unavailable, honor the cap.
          if (maxHoldAiDefer && !exitReason) {
            exitReason = `max hold ${config.maxHoldMinutes}m (AI unavailable)`;
          } else if (!exitReason && newStreak >= 3) {
            exitReason = `AI unavailable x${newStreak}`;
          }
        }
      } else if (maxHoldAiDefer && !config.aiEnabled) {
        // Shouldn't happen (maxHoldAiDefer requires aiEnabled), but guard anyway.
        exitReason = `max hold ${config.maxHoldMinutes}m`;
      }

      if (!exitReason) continue;
      botState.updatePosition(position.id, { status: 'closing' });

      try {
        const order = await getSwapOrder({
          inputMint: position.mint,
          outputMint: SOL_MINT,
          amount: position.tokenAmountRemaining,
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
          const remainingFraction = position.tokenAmountRemaining / position.tokenAmountOut;
          const carvedSolIn = position.amountSolIn * remainingFraction;
          botState.addClosedPosition({
            id: position.id, mint: position.mint, symbol: position.symbol,
            entryPrice: position.entryPrice, exitPrice: currentPrice,
            amountSolIn: carvedSolIn, solReturned,
            pnlSol: solReturned - carvedSolIn, pnlPct,
            peakPnlPct: Math.max(position.peakPnlPct ?? 0, pnlPct),
            exitReason,
            entryTime: position.entryTime, exitTime: Date.now(),
            entryTxSig: position.entryTxSig, exitTxSig: result.signature,
          });
          botState.removePosition(position.id);
          clearDecisionHistory(position.mint);
          botState.addLog({ type: 'sell', message: `Sold ${position.symbol} — ${exitReason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, txSig: result.signature });
          notify('bot.exit', formatExit({
            symbol: position.symbol, price: currentPrice, pnlPct,
            reason: exitReason, txSig: result.signature,
          }));
        } else {
          botState.updatePosition(position.id, { status: 'open' });
          const em = result.error ?? 'unknown';
          botState.addLog({ type: 'error', message: `Sell ${position.symbol} failed: ${em}` });
          notify('bot.error', formatError(`Sell ${position.symbol} failed: ${em}`));
        }
      } catch (err) {
        botState.updatePosition(position.id, { status: 'open' });
        const msg = err instanceof Error ? err.message : String(err);
        botState.addLog({ type: 'error', message: `Sell ${position.symbol} error: ${msg}` });
        notify('bot.error', formatError(`Sell ${position.symbol}: ${msg}`));
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
        amount: position.tokenAmountRemaining, userPublicKey: pubkey,
        slippageBps: config.slippageBps, swapMode: 'ExactIn',
      });
      const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
      tx.sign([keypair]);
      const result = await executeSwap(Buffer.from(tx.serialize()).toString('base64'), order.requestId);

      if (result.status === 'Success') {
        const solReturned = Number(result.outputAmountResult ?? order.outAmount) / 1e9;
        const remainingFraction = position.tokenAmountRemaining / position.tokenAmountOut;
        const carvedSolIn = position.amountSolIn * remainingFraction;
        botState.addClosedPosition({
          id: position.id, mint: position.mint, symbol: position.symbol,
          entryPrice: position.entryPrice, exitPrice: currentPrice,
          amountSolIn: carvedSolIn, solReturned,
          pnlSol: solReturned - carvedSolIn, pnlPct,
          peakPnlPct: Math.max(position.peakPnlPct ?? 0, pnlPct),
          exitReason: reason,
          entryTime: position.entryTime, exitTime: Date.now(),
          entryTxSig: position.entryTxSig, exitTxSig: result.signature,
        });
        botState.removePosition(position.id);
        clearDecisionHistory(position.mint);
        botState.addLog({ type: 'sell', message: `Sold ${position.symbol} — ${reason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, txSig: result.signature });
        notify('bot.exit', formatExit({
          symbol: position.symbol, price: currentPrice, pnlPct,
          reason, txSig: result.signature,
        }));
      } else {
        botState.updatePosition(position.id, { status: 'open' });
        const em = result.error ?? 'unknown';
        botState.addLog({ type: 'error', message: `Sell ${position.symbol} failed: ${em}` });
        notify('bot.error', formatError(`Sell ${position.symbol} (close-all) failed: ${em}`));
      }
    } catch (err) {
      botState.updatePosition(position.id, { status: 'open' });
      const msg = err instanceof Error ? err.message : String(err);
      botState.addLog({ type: 'error', message: `Sell ${position.symbol} error: ${msg}` });
      notify('bot.error', formatError(`Sell ${position.symbol} (close-all): ${msg}`));
    }
  }
}

async function doTierSell(
  position: ReturnType<typeof botState.getPositions>[number],
  tier: 1 | 2,
  sellAmount: number,
  currentPrice: number,
  pnlPct: number,
  peakPnlPct: number,
  peakPrice: number,
  trailingStopPrice: number,
  config: BotConfig,
  keypair: Keypair,
  pubkey: string,
) {
  botState.updatePosition(position.id, { status: 'closing' });
  try {
    const order = await getSwapOrder({
      inputMint: position.mint, outputMint: SOL_MINT,
      amount: sellAmount, userPublicKey: pubkey,
      slippageBps: config.slippageBps, swapMode: 'ExactIn',
    });
    const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
    tx.sign([keypair]);
    const result = await executeSwap(Buffer.from(tx.serialize()).toString('base64'), order.requestId);

    if (result.status === 'Success') {
      const solReturned = Number(result.outputAmountResult ?? order.outAmount) / 1e9;
      const soldFractionOfInitial = sellAmount / position.tokenAmountOut;
      const carvedSolIn = position.amountSolIn * soldFractionOfInitial;
      const newRemaining = position.tokenAmountRemaining - sellAmount;
      const newTiers = [...(position.tiersHit ?? []), tier];
      const sellPct = tier === 1 ? config.tp1SellPct : config.tp2SellPct;
      const triggerPct = tier === 1 ? config.tp1Pct : config.tp2Pct;
      const exitReason = `T${tier} +${triggerPct}% (sold ${sellPct}% of ${tier === 1 ? 'initial' : 'remainder'})`;

      botState.addClosedPosition({
        id: `${position.id}-t${tier}`,
        mint: position.mint, symbol: position.symbol,
        entryPrice: position.entryPrice, exitPrice: currentPrice,
        amountSolIn: carvedSolIn, solReturned,
        pnlSol: solReturned - carvedSolIn, pnlPct, peakPnlPct,
        exitReason, tier,
        entryTime: position.entryTime, exitTime: Date.now(),
        entryTxSig: position.entryTxSig, exitTxSig: result.signature,
      });

      const update: Partial<typeof position> = {
        status: 'open',
        tokenAmountRemaining: newRemaining,
        tiersHit: newTiers,
      };
      if (tier === 1) {
        if (config.afterT1Mode === 'breakeven') {
          const floor = position.entryPrice * 1.005;
          update.breakevenFloor = floor;
          update.trailingStopPrice = Math.max(trailingStopPrice, floor);
        } else {
          update.trailingStopPrice = Math.max(
            trailingStopPrice,
            peakPrice * (1 - config.tightTrailPct / 100),
          );
        }
      }
      botState.updatePosition(position.id, update);
      botState.addLog({
        type: 'sell',
        message: `${position.symbol} ${exitReason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
        txSig: result.signature,
      });
      notify('bot.exit', formatExit({
        symbol: position.symbol, price: currentPrice, pnlPct,
        reason: exitReason, txSig: result.signature,
      }));
    } else {
      botState.updatePosition(position.id, { status: 'open' });
      const em = result.error ?? 'unknown';
      botState.addLog({ type: 'error', message: `T${tier} sell ${position.symbol} failed: ${em}` });
      notify('bot.error', formatError(`T${tier} sell ${position.symbol} failed: ${em}`));
    }
  } catch (err) {
    botState.updatePosition(position.id, { status: 'open' });
    const msg = err instanceof Error ? err.message : String(err);
    botState.addLog({ type: 'error', message: `T${tier} sell ${position.symbol} error: ${msg}` });
    notify('bot.error', formatError(`T${tier} sell ${position.symbol}: ${msg}`));
  }
}

export function start(key: Uint8Array, configOverrides: Partial<BotConfig> = {}) {
  if (isRunning()) stop();
  secretKey = key;
  botState.setConfig({ ...configOverrides, enabled: true });
  botState.addLog({ type: 'info', message: 'Background bot started' });
  const pk = Keypair.fromSecretKey(key).publicKey.toBase58();
  notify('bot.start', formatBotStart(pk));

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
  aiRejectedUntil.clear();
  secretKey = null;
  botState.setConfig({ enabled: false });
  botState.addLog({ type: 'info', message: 'Background bot stopped' });
  notify('bot.stop', formatBotStop('manual stop'));
}
