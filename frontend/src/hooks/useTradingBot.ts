import { useEffect } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { useBotStore } from '../store/botStore';
import { useWalletStore } from '../store/walletStore';
import { fetchTrendingTokens } from '../api/tokens';
import { fetchPrices } from '../api/price';
import { getSwapOrder, executeSwap } from '../api/swap';
import { MINTS } from '../config/constants';
import type { BotPosition } from '../store/botStore';

// Guards prevent a new interval tick from running while the previous is still awaiting
let entryLoopRunning = false;
let exitLoopRunning = false;

async function doTierSellLocal(
  position: BotPosition,
  tier: 1 | 2,
  sellAmount: number,
  currentPrice: number,
  pnlPct: number,
  peakPnlPct: number,
  peakPrice: number,
  trailingStopPrice: number,
  pubkey: string,
) {
  const { config, updatePosition, addClosedPosition, addLog } = useBotStore.getState();
  const keypair = useWalletStore.getState().keypair;
  if (!keypair) return;

  updatePosition(position.id, { status: 'closing' });
  try {
    const order = await getSwapOrder({
      inputMint: position.mint,
      outputMint: MINTS.SOL,
      amount: sellAmount,
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
      const soldFractionOfInitial = sellAmount / position.tokenAmountOut;
      const carvedSolIn = position.amountSolIn * soldFractionOfInitial;
      const newRemaining = position.tokenAmountRemaining - sellAmount;
      const newTiers = [...(position.tiersHit ?? []), tier];
      const sellPct = tier === 1 ? config.tp1SellPct : config.tp2SellPct;
      const triggerPct = tier === 1 ? config.tp1Pct : config.tp2Pct;
      const exitReason = `T${tier} +${triggerPct}% (sold ${sellPct}% of ${tier === 1 ? 'initial' : 'remainder'})`;

      addClosedPosition({
        id: `${position.id}-t${tier}`,
        mint: position.mint,
        symbol: position.symbol,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        amountSolIn: carvedSolIn,
        solReturned,
        pnlSol: solReturned - carvedSolIn,
        pnlPct,
        peakPnlPct,
        exitReason,
        tier,
        entryTime: position.entryTime,
        exitTime: Date.now(),
        entryTxSig: position.entryTxSig,
        exitTxSig: result.signature,
      });

      const update: Partial<BotPosition> = {
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
      updatePosition(position.id, update);
      addLog({
        type: 'sell',
        message: `${position.symbol} ${exitReason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
        txSig: result.signature,
      });
    } else {
      updatePosition(position.id, { status: 'open' });
      addLog({ type: 'error', message: `T${tier} sell ${position.symbol} failed: ${result.error ?? 'unknown'}` });
    }
  } catch (err) {
    updatePosition(position.id, { status: 'open' });
    addLog({ type: 'error', message: `T${tier} sell ${position.symbol} error: ${err instanceof Error ? err.message : String(err)}` });
  }
}

async function runEntryLoop() {
  if (entryLoopRunning) return;
  entryLoopRunning = true;
  try {
    const { config, positions, addPosition, addLog } = useBotStore.getState();
    const keypair = useWalletStore.getState().keypair;
    if (!config.enabled || !keypair) return;

    const openPositions = positions.filter((p) => p.status === 'open');
    if (openPositions.length >= config.maxPositions) return;

    let tokens: Awaited<ReturnType<typeof fetchTrendingTokens>>;
    try {
      tokens = await fetchTrendingTokens(config.interval);
    } catch {
      return;
    }

    const openMints = new Set(openPositions.map((p) => p.mint));
    const pubkey = keypair.publicKey.toBase58();

    const now = Date.now();
    const cooldownMs = config.rebuyCooldownMinutes * 60_000;
    const recentlyExited = new Set(
      useBotStore.getState().closedPositions
        .filter((p) => now - p.exitTime < cooldownMs)
        .map((p) => p.mint)
    );

    const sorted = [...tokens].sort((a, b) => (b.organicScore ?? 0) - (a.organicScore ?? 0));

    for (const token of sorted) {
      const currentOpen = useBotStore.getState().positions.filter((p) => p.status === 'open').length;
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

      try {
        const order = await getSwapOrder({
          inputMint: MINTS.SOL,
          outputMint: token.address,
          amount: Math.floor(config.buyAmountSol * 1e9),
          userPublicKey: pubkey,
          slippageBps: config.slippageBps,
        });

        const impact = parseFloat(order.priceImpactPct ?? '0');
        if (impact > config.maxPriceImpactPct) {
          addLog({ type: 'skip', message: `${token.symbol}: price impact ${impact.toFixed(2)}% exceeds ${config.maxPriceImpactPct}% limit` });
          continue;
        }

        const txBytes = Buffer.from(order.transaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBytes);
        tx.sign([keypair]);
        const signed = Buffer.from(tx.serialize()).toString('base64');

        const result = await executeSwap(signed, order.requestId);

        if (result.status !== 'Success') {
          addLog({ type: 'error', message: `Buy ${token.symbol} failed: ${result.error ?? 'unknown'}` });
          continue;
        }

        if (!result.signature) {
          addLog({ type: 'error', message: `Buy ${token.symbol}: swap succeeded but no signature returned` });
          continue;
        }

        const tokenAmountOut = Number(result.outputAmountResult ?? order.outAmount);
        const entryPrice = token.usdPrice;

        addPosition({
          id: crypto.randomUUID(),
          mint: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
          entryPrice,
          entryTime: Date.now(),
          entryTxSig: result.signature,
          amountSolIn: config.buyAmountSol,
          tokenAmountOut,
          tokenAmountRemaining: tokenAmountOut,
          tiersHit: [],
          peakPrice: entryPrice,
          peakPnlPct: 0,
          trailingStopPrice: entryPrice * (1 - config.trailingStopPct / 100),
          status: 'open',
        });

        addLog({
          type: 'buy',
          message: `Bought ${token.symbol} @ $${entryPrice.toFixed(6)} — ${config.buyAmountSol} SOL in`,
          txSig: result.signature,
        });

        openMints.add(token.address);
      } catch (err) {
        addLog({
          type: 'error',
          message: `Buy ${token.symbol} error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } finally {
    entryLoopRunning = false;
  }
}

async function runExitLoop() {
  if (exitLoopRunning) return;
  exitLoopRunning = true;
  try {
    const { config, positions, updatePosition, removePosition, addClosedPosition, addLog } = useBotStore.getState();
    const keypair = useWalletStore.getState().keypair;
    if (!config.enabled || !keypair) return;

    const openPositions = positions.filter((p) => p.status === 'open');
    if (openPositions.length === 0) return;

    let prices: Awaited<ReturnType<typeof fetchPrices>>;
    try {
      prices = await fetchPrices(openPositions.map((p) => p.mint));
    } catch {
      return;
    }

    const pubkey = keypair.publicKey.toBase58();
    const now = Date.now();

    for (const position of openPositions) {
      const currentPrice = prices[position.mint]?.usdPrice;
      if (!currentPrice) continue;

      const tiersHit = position.tiersHit ?? [];
      const afterT1 = tiersHit.includes(1);
      const afterT2 = tiersHit.includes(2);
      const activeTrailPct = (config.tieredTpEnabled && afterT1 && config.afterT1Mode === 'tighten')
        ? config.tightTrailPct
        : config.trailingStopPct;

      let { peakPrice, trailingStopPrice } = position;
      if (currentPrice > peakPrice) {
        peakPrice = currentPrice;
        const trailBase = peakPrice * (1 - activeTrailPct / 100);
        trailingStopPrice = Math.max(trailBase, position.breakevenFloor ?? 0);
        updatePosition(position.id, { peakPrice, trailingStopPrice });
      }

      const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      const heldMinutes = (now - position.entryTime) / 60_000;

      const peakPnlPct = Math.max(position.peakPnlPct ?? 0, pnlPct);
      if (peakPnlPct !== position.peakPnlPct) {
        updatePosition(position.id, { peakPnlPct });
      }

      if (config.tieredTpEnabled) {
        const tier: 0 | 1 | 2 = !afterT1 && pnlPct >= config.tp1Pct ? 1
          : (afterT1 && !afterT2 && pnlPct >= config.tp2Pct) ? 2
          : 0;
        if (tier > 0) {
          const sellAmount = tier === 1
            ? Math.floor(position.tokenAmountOut * config.tp1SellPct / 100)
            : Math.floor(position.tokenAmountRemaining * config.tp2SellPct / 100);
          if (sellAmount > 0 && sellAmount <= position.tokenAmountRemaining) {
            await doTierSellLocal(position, tier, sellAmount, currentPrice, pnlPct, peakPnlPct, peakPrice, trailingStopPrice, pubkey);
          }
          continue;
        }
      }

      let exitReason: string | null = null;
      if (currentPrice <= trailingStopPrice) {
        exitReason = `trailing stop (${activeTrailPct}% from peak $${peakPrice.toFixed(6)})`;
      } else if (!config.tieredTpEnabled && pnlPct >= config.takeProfitPct) {
        exitReason = `take profit +${pnlPct.toFixed(1)}%`;
      } else if (heldMinutes >= config.maxHoldMinutes) {
        exitReason = `max hold ${config.maxHoldMinutes}m`;
      }

      if (!exitReason) continue;

      updatePosition(position.id, { status: 'closing' });

      try {
        const order = await getSwapOrder({
          inputMint: position.mint,
          outputMint: MINTS.SOL,
          amount: position.tokenAmountRemaining,
          userPublicKey: pubkey,
          slippageBps: config.slippageBps,
          swapMode: 'ExactIn',
        });

        const txBytes = Buffer.from(order.transaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBytes);
        tx.sign([keypair]);
        const signed = Buffer.from(tx.serialize()).toString('base64');

        const result = await executeSwap(signed, order.requestId);

        if (result.status === 'Success') {
          const solReturned = Number(result.outputAmountResult ?? order.outAmount) / 1e9;
          const remainingFraction = position.tokenAmountRemaining / position.tokenAmountOut;
          const carvedSolIn = position.amountSolIn * remainingFraction;
          const exitPrice = currentPrice;
          addClosedPosition({
            id: position.id,
            mint: position.mint,
            symbol: position.symbol,
            entryPrice: position.entryPrice,
            exitPrice,
            amountSolIn: carvedSolIn,
            solReturned,
            pnlSol: solReturned - carvedSolIn,
            pnlPct,
            peakPnlPct,
            exitReason,
            entryTime: position.entryTime,
            exitTime: Date.now(),
            entryTxSig: position.entryTxSig,
            exitTxSig: result.signature,
          });
          removePosition(position.id);
          addLog({
            type: 'sell',
            message: `Sold ${position.symbol} — ${exitReason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
            txSig: result.signature,
          });
        } else {
          updatePosition(position.id, { status: 'open' });
          addLog({ type: 'error', message: `Sell ${position.symbol} failed: ${result.error ?? 'unknown'}` });
        }
      } catch (err) {
        updatePosition(position.id, { status: 'open' });
        addLog({
          type: 'error',
          message: `Sell ${position.symbol} error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } finally {
    exitLoopRunning = false;
  }
}

export async function closeAllAndStop() {
  const { config, positions, updatePosition, removePosition, addClosedPosition, addLog, updateConfig } = useBotStore.getState();
  const keypair = useWalletStore.getState().keypair;

  // Disable immediately so entry loop won't fire new buys
  updateConfig({ enabled: false });

  const openPositions = positions.filter((p) => p.status === 'open');
  if (openPositions.length === 0 || !keypair) return;

  addLog({ type: 'info', message: `Bot stopped — closing ${openPositions.length} position${openPositions.length !== 1 ? 's' : ''}` });

  let prices: Awaited<ReturnType<typeof fetchPrices>>;
  try {
    prices = await fetchPrices(openPositions.map((p) => p.mint));
  } catch {
    addLog({ type: 'error', message: 'Failed to fetch prices for close-all' });
    return;
  }

  const pubkey = keypair.publicKey.toBase58();

  for (const position of openPositions) {
    const currentPrice = prices[position.mint]?.usdPrice ?? position.entryPrice;
    const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    const exitReason = 'bot stopped';

    updatePosition(position.id, { status: 'closing' });

    try {
      const order = await getSwapOrder({
        inputMint: position.mint,
        outputMint: MINTS.SOL,
        amount: position.tokenAmountRemaining,
        userPublicKey: pubkey,
        slippageBps: config.slippageBps,
        swapMode: 'ExactIn',
      });

      const txBytes = Buffer.from(order.transaction, 'base64');
      const tx = VersionedTransaction.deserialize(txBytes);
      tx.sign([keypair]);
      const signed = Buffer.from(tx.serialize()).toString('base64');

      const result = await executeSwap(signed, order.requestId);

      if (result.status === 'Success') {
        const solReturned = Number(result.outputAmountResult ?? order.outAmount) / 1e9;
        const remainingFraction = position.tokenAmountRemaining / position.tokenAmountOut;
        const carvedSolIn = position.amountSolIn * remainingFraction;
        addClosedPosition({
          id: position.id,
          mint: position.mint,
          symbol: position.symbol,
          entryPrice: position.entryPrice,
          exitPrice: currentPrice,
          amountSolIn: carvedSolIn,
          solReturned,
          pnlSol: solReturned - carvedSolIn,
          pnlPct,
          peakPnlPct: Math.max(position.peakPnlPct ?? 0, pnlPct),
          exitReason,
          entryTime: position.entryTime,
          exitTime: Date.now(),
          entryTxSig: position.entryTxSig,
          exitTxSig: result.signature,
        });
        removePosition(position.id);
        addLog({
          type: 'sell',
          message: `Sold ${position.symbol} — ${exitReason} — P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
          txSig: result.signature,
        });
      } else {
        updatePosition(position.id, { status: 'open' });
        addLog({ type: 'error', message: `Sell ${position.symbol} failed: ${result.error ?? 'unknown'}` });
      }
    } catch (err) {
      updatePosition(position.id, { status: 'open' });
      addLog({ type: 'error', message: `Sell ${position.symbol} error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}

export function useTradingBot() {
  const enabled = useBotStore((s) => s.config.enabled);
  const pollIntervalMs = useBotStore((s) => s.config.pollIntervalMs);

  useEffect(() => {
    if (!enabled) return;

    runEntryLoop();
    runExitLoop();

    const entryTimer = setInterval(runEntryLoop, pollIntervalMs);
    const exitTimer = setInterval(runExitLoop, 10_000);

    return () => {
      clearInterval(entryTimer);
      clearInterval(exitTimer);
    };
  }, [enabled, pollIntervalMs]);
}
