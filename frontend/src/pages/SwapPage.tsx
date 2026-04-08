import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActivePublicKey } from '../store/walletStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSwapQuote, useSwapExecute } from '../hooks/useSwap';
import { useSolBalance } from '../hooks/useSolBalance';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { TokenSearchPanel } from '../components/panels/TokenSearchPanel';
import { TradingChart } from '../components/charts/TradingChart';
import type { TokenInfo } from '../hooks/useTokenSearch';
import { formatUsd } from '../utils/format';
import { MINTS } from '../config/constants';

const SOL_TOKEN: TokenInfo = {
  address: MINTS.SOL,
  name: 'Solana',
  symbol: 'SOL',
  decimals: 9,
  logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
};

const USDC_TOKEN: TokenInfo = {
  address: MINTS.USDC,
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6,
  logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
};

function formatOutput(amount: string | undefined, decimals: number): string {
  if (!amount) return '—';
  const val = Number(amount) / Math.pow(10, decimals);
  return val.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function SwapPage() {
  const pubkey = useActivePublicKey();
  const { slippageBps, setSlippageBps } = useSettingsStore();
  const { data: solBalanceLamports } = useSolBalance(pubkey);
  const [searchParams, setSearchParams] = useSearchParams();

  const [inputToken, setInputToken] = useState<TokenInfo>(SOL_TOKEN);

  // Pre-select input token from nav search (?inputMint=...&inputSymbol=...)
  useEffect(() => {
    const mint   = searchParams.get('inputMint');
    const symbol = searchParams.get('inputSymbol') ?? '';
    if (mint && mint !== inputToken.address) {
      setInputToken({
        address:  mint,
        symbol:   symbol || mint.slice(0, 4),
        name:     symbol || 'Unknown Token',
        decimals: 6,
        logoURI:  undefined,
      });
      // Clear params so back-navigation doesn't re-apply
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [outputToken, setOutputToken] = useState<TokenInfo>(USDC_TOKEN);
  const [inputAmount, setInputAmount] = useState('');

  const rawAmount = inputAmount
    ? Math.floor(parseFloat(inputAmount) * Math.pow(10, inputToken.decimals))
    : 0;

  const quoteParams = pubkey
    ? { inputMint: inputToken.address, outputMint: outputToken.address, amount: rawAmount, userPublicKey: pubkey }
    : {};

  const { data: quote, isLoading: isQuoting, error: quoteError } = useSwapQuote(quoteParams);
  const { mutateAsync: executeSwap, isPending: isExecuting } = useSwapExecute();

  // Swap tokens
  function flipTokens() {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount('');
  }

  // Max SOL balance (leave 0.01 for fees)
  function handleMax() {
    if (!solBalanceLamports || solBalanceLamports === null || inputToken.address !== MINTS.SOL) return;
    const max = Math.max(0, (solBalanceLamports as number) - 10_000_000) / 1e9;
    setInputAmount(max.toFixed(4));
  }

  async function handleSwap() {
    if (!quote) return;
    try {
      await executeSwap(quote);
    } catch {
      // errors handled in mutation's onError
    }
  }

  const priceImpact = quote ? parseFloat(quote.priceImpactPct) : null;
  const highImpact = priceImpact !== null && priceImpact > 1;
  const outputAmount = quote ? formatOutput(quote.outAmount, outputToken.decimals) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">Swap</h1>
        <Badge variant="green">Jupiter Ultra v2</Badge>
        {quote?.mode && <Badge variant="muted">{quote.mode}</Badge>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-4 items-start">
        {/* Left: price chart */}
        <Card>
          <CardBody>
            <TradingChart
              mint={inputToken.address}
              symbol={inputToken.symbol}
            />
          </CardBody>
        </Card>

        {/* Right: swap card */}
        <Card>
        <CardHeader title="Token Swap" subtitle="Best route across all DEXes + RFQ" />
        <CardBody className="flex flex-col gap-3">

          {/* Input token */}
          <div className="bg-surface-2 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-text-dim">You Pay</p>
              {inputToken.address === MINTS.SOL && solBalanceLamports != null && (
                <button onClick={handleMax} className="text-xs text-blue hover:underline cursor-pointer">
                  Max: {((solBalanceLamports as number) / 1e9).toFixed(4)} SOL
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <TokenSearchPanel value={inputToken} onChange={setInputToken} />
              </div>
              <input
                type="number"
                min="0"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-right text-2xl text-text placeholder-muted outline-none w-0"
              />
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center -my-1">
            <button
              onClick={flipTokens}
              className="bg-surface border border-border rounded-full p-2.5 hover:bg-surface-2 transition-colors text-text-dim hover:text-text z-10"
            >
              ⇌
            </button>
          </div>

          {/* Output token */}
          <div className="bg-surface-2 rounded-xl p-4 border border-border">
            <p className="text-xs text-text-dim mb-3">You Receive</p>
            <div className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <TokenSearchPanel value={outputToken} onChange={setOutputToken} />
              </div>
              <div className="flex-1 text-right">
                {isQuoting ? (
                  <span className="text-text-dim text-xl animate-pulse">…</span>
                ) : (
                  <span className={`text-2xl ${outputAmount && outputAmount !== '—' ? 'text-text' : 'text-text-dim'}`}>
                    {outputAmount ?? '—'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quote details */}
          <div className="flex flex-col gap-1.5 text-xs bg-surface-2 rounded-xl p-3 border border-border">
            <div className="flex justify-between">
              <span className="text-text-dim">Slippage Tolerance</span>
              <div className="flex gap-1">
                {[10, 50, 100].map((bps) => (
                  <button
                    key={bps}
                    onClick={() => setSlippageBps(bps)}
                    className={`px-2 py-0.5 rounded text-xs cursor-pointer ${slippageBps === bps ? 'bg-green/20 text-green' : 'text-text-dim hover:text-text'}`}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">Price Impact</span>
              <span className={highImpact ? 'text-orange font-medium' : 'text-text'}>
                {priceImpact !== null ? `${priceImpact.toFixed(3)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">Route</span>
              <span className="text-text">{quote?.swapType ?? '—'}</span>
            </div>
          </div>

          {/* Warnings */}
          {highImpact && (
            <div className="bg-orange/10 border border-orange/20 rounded-lg p-3">
              <p className="text-xs text-orange font-medium">⚠ High price impact ({priceImpact?.toFixed(2)}%). Consider a smaller amount.</p>
            </div>
          )}
          {quoteError && (
            <div className="bg-red/10 border border-red/20 rounded-lg p-3">
              <p className="text-xs text-red">{(quoteError as Error).message}</p>
            </div>
          )}

          {/* CTA */}
          {!pubkey ? (
            <div className="bg-surface-2 rounded-xl p-4 text-center border border-border">
              <p className="text-sm text-text-dim">Connect a wallet to swap</p>
            </div>
          ) : (
            <Button
              onClick={handleSwap}
              loading={isExecuting}
              disabled={!quote || isQuoting || !inputAmount || parseFloat(inputAmount) <= 0}
              className="w-full py-3 text-base"
            >
              {isQuoting ? 'Getting quote…' : !quote ? 'Enter an amount' : `Swap ${inputToken.symbol} → ${outputToken.symbol}`}
            </Button>
          )}
        </CardBody>
        </Card>
      </div>
    </div>
  );
}
