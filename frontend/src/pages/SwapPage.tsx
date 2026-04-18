import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActivePublicKey } from '../store/walletStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSwapQuote, useSwapExecute } from '../hooks/useSwap';
import { useSolBalance } from '../hooks/useSolBalance';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { useTokenMetadata } from '../hooks/useTokenMetadata';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { TokenSearchPanel, type WalletToken } from '../components/panels/TokenSearchPanel';
import { TokenInfoPanel } from '../components/panels/TokenInfoPanel';
import type { TokenInfo } from '../hooks/useTokenSearch';
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
  const { data: tokenBalances } = useTokenBalances(pubkey);
  const [searchParams, setSearchParams] = useSearchParams();

  const [inputToken, setInputToken] = useState<TokenInfo>(SOL_TOKEN);

  // Pre-select tokens and amount from URL params
  // ?inputMint=...&inputSymbol=... (from nav search)
  // ?outputMint=...&outputSymbol=...&amount=... (from Trending quick-buy)
  const [outputToken, setOutputToken] = useState<TokenInfo>(() => {
    const mint   = searchParams.get('outputMint');
    const symbol = searchParams.get('outputSymbol') ?? '';
    if (mint) return { address: mint, symbol: symbol || mint.slice(0, 4), name: symbol || 'Unknown Token', decimals: 6, logoURI: undefined };
    return USDC_TOKEN;
  });
  const [inputAmount, setInputAmount] = useState<string>(() => searchParams.get('amount') ?? '');

  useEffect(() => {
    const inputMint   = searchParams.get('inputMint');
    const inputSymbol = searchParams.get('inputSymbol') ?? '';
    if (inputMint && inputMint !== inputToken.address) {
      setInputToken({
        address:  inputMint,
        symbol:   inputSymbol || inputMint.slice(0, 4),
        name:     inputSymbol || 'Unknown Token',
        decimals: 6,
        logoURI:  undefined,
      });
    }
    setSearchParams({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rawAmount = inputAmount
    ? Math.floor(parseFloat(inputAmount) * Math.pow(10, inputToken.decimals))
    : 0;

  const quoteParams = pubkey
    ? { inputMint: inputToken.address, outputMint: outputToken.address, amount: rawAmount, userPublicKey: pubkey }
    : {};

  const { data: quote, isLoading: isQuoting, error: quoteError } = useSwapQuote(quoteParams);
  const { mutateAsync: executeSwap, isPending: isExecuting } = useSwapExecute();

  function flipTokens() {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount('');
  }

  // Resolve input token balance (SOL native or SPL)
  const inputBalance = (() => {
    if (inputToken.address === MINTS.SOL && solBalanceLamports != null) {
      return { uiAmount: (solBalanceLamports as number) / 1e9, decimals: 9, isSol: true };
    }
    const tb = tokenBalances?.find((b) => b.mint === inputToken.address);
    if (tb?.uiAmount) return { uiAmount: tb.uiAmount, decimals: tb.decimals, isSol: false };
    return null;
  })();

  function handleMax() {
    if (!inputBalance) return;
    // Reserve 0.01 SOL for fees when swapping SOL
    const max = inputBalance.isSol ? Math.max(0, inputBalance.uiAmount - 0.01) : inputBalance.uiAmount;
    setInputAmount(max.toFixed(Math.min(inputBalance.decimals, 6)));
  }

  // Build "wallet tokens" list for the input TokenSearchPanel dropdown
  const splMintsInWallet = (tokenBalances ?? []).map((b) => b.mint);
  const walletMeta = useTokenMetadata(splMintsInWallet);
  const walletTokens: WalletToken[] = [
    ...(solBalanceLamports != null && (solBalanceLamports as number) > 0
      ? [{ ...SOL_TOKEN, balanceUi: (solBalanceLamports as number) / 1e9 }]
      : []),
    ...(tokenBalances ?? [])
      .filter((b) => b.uiAmount && b.uiAmount > 0)
      .map<WalletToken>((b) => {
        const m = walletMeta[b.mint];
        return {
          address: b.mint,
          symbol: m?.symbol ?? b.mint.slice(0, 4) + '…',
          name: m?.name ?? 'Unknown Token',
          decimals: b.decimals,
          logoURI: m?.logoURI,
          balanceUi: b.uiAmount ?? 0,
        };
      }),
  ];

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

      <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
        {/* Token info */}
        <Card>
          <CardBody>
            <TokenInfoPanel token={outputToken} />
          </CardBody>
        </Card>

        {/* Swap card */}
        <Card>
        <CardHeader title="Token Swap" subtitle="Best route across all DEXes + RFQ" />
        <CardBody className="flex flex-col gap-3">

          {/* Input token */}
          <div className="bg-surface-2 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-text-dim">You Pay</p>
              {inputBalance && (
                <button onClick={handleMax} className="text-xs text-blue hover:underline cursor-pointer">
                  Max: {inputBalance.uiAmount.toFixed(Math.min(inputBalance.decimals, 4))} {inputToken.symbol}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <TokenSearchPanel value={inputToken} onChange={setInputToken} walletTokens={walletTokens} />
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
