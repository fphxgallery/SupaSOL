import { useState } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useLendTokens, useLendPositions, useLendEarnings, useLendDeposit, useLendWithdraw } from '../hooks/useLend';
import { useSignAndSend } from '../hooks/useSignAndSend';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatUsd } from '../utils/format';
import type { LendToken, LendPosition } from '../api/lend';

function LendTokenCard({
  token,
  wallet,
  position,
}: {
  token: LendToken;
  wallet: string;
  position?: LendPosition;
}) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const deposit = useLendDeposit();
  const withdraw = useLendWithdraw();

  async function handleAction() {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) return;
    const baseAmount = Math.floor(parsed * Math.pow(10, token.decimals));
    try {
      if (mode === 'deposit') {
        await deposit.mutateAsync({ wallet, mint: token.mint, amount: baseAmount, symbol: token.symbol });
      } else {
        await withdraw.mutateAsync({ wallet, mint: token.mint, amount: baseAmount, symbol: token.symbol });
      }
      setAmount('');
    } catch {
      // errors surfaced via toast
    }
  }

  const isLoading = deposit.isPending || withdraw.isPending;
  const hasPosition = position != null && (position.depositedAmount ?? 0) > 0;

  return (
    <div className="border border-border rounded-xl bg-surface-2 overflow-hidden">
      {/* Top row: token info + APY/TVL */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {token.logoURI && (
            <img
              src={token.logoURI}
              alt={token.symbol}
              className="w-9 h-9 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div>
            <p className="text-sm font-semibold text-text">{token.symbol}</p>
            <p className="text-xs text-text-dim">{token.name}</p>
          </div>
        </div>
        <div className="text-right">
          {token.supplyApy != null ? (
            <p className="text-sm font-semibold text-green">{token.supplyApy.toFixed(2)}% APY</p>
          ) : (
            <p className="text-sm text-text-dim">—</p>
          )}
          {token.tvl !== undefined && (
            <p className="text-xs text-text-dim mt-0.5">TVL: {formatUsd(token.tvl)}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border mx-4" />

      {/* Bottom row: deposited (left) + action (right) */}
      <div className="flex items-end gap-3 px-4 py-3">
        {/* Deposited amount — bottom left */}
        <div className="shrink-0 min-w-[120px]">
          <p className="text-[10px] text-text-dim uppercase tracking-wide font-semibold mb-1">Deposited</p>
          {hasPosition ? (
            <div>
              <p className="text-sm font-semibold text-text">
                {position!.depositedAmount!.toLocaleString('en-US', { maximumFractionDigits: 4 })} {token.symbol}
              </p>
              {position!.depositedValue !== undefined && (
                <p className="text-xs text-text-dim">{formatUsd(position!.depositedValue)}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-dim">—</p>
          )}
        </div>

        {/* Deposit / Withdraw action */}
        <div className="flex flex-1 items-center gap-2">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-surface rounded-lg p-0.5 border border-border shrink-0">
            {(['deposit', 'withdraw'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs rounded-md capitalize cursor-pointer transition-colors ${
                  mode === m
                    ? 'bg-green/10 text-green border border-green/20'
                    : 'text-text-dim hover:text-text'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder={`Amount (${token.symbol})`}
            className="flex-1 min-w-0"
          />
          <Button
            onClick={handleAction}
            loading={isLoading}
            disabled={!amount || isLoading}
            size="sm"
          >
            {mode === 'deposit' ? 'Deposit' : 'Withdraw'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LendPage() {
  const pubkey = useActivePublicKey();
  const { hasWallet } = useSignAndSend();
  const { data: tokens, isLoading: tokensLoading, isError: tokensError, refetch: refetchTokens } = useLendTokens();
  const { data: positions } = useLendPositions(pubkey);
  const { data: earnings } = useLendEarnings(pubkey);

  const totalDeposited = earnings?.totalDeposited ?? 0;
  const activePositions = positions?.length ?? 0;

  // Build a map of mint → position for quick lookup
  const positionByMint = new Map<string, LendPosition>(
    (positions ?? []).map((p) => [p.mint, p])
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-text">Lend / Earn</h1>
          <Badge variant="blue">Jupiter Lend</Badge>
        </div>
        {pubkey && (
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Total Deposited</p>
              <p className="text-sm font-bold text-green">
                {totalDeposited > 0 ? formatUsd(totalDeposited) : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-text-dim uppercase tracking-wide font-semibold">Positions</p>
              <p className="text-sm font-bold text-text">{activePositions}</p>
            </div>
          </div>
        )}
      </div>

      {/* Markets */}
      {tokensLoading ? (
        <div className="flex items-center justify-center py-16 text-text-dim text-sm">
          <span className="animate-spin mr-2">⟳</span> Loading markets…
        </div>
      ) : tokensError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-text-dim">Failed to load lending markets.</p>
          <Button variant="secondary" size="sm" onClick={() => refetchTokens()}>Retry</Button>
        </div>
      ) : !tokens?.length ? (
        <p className="text-sm text-text-dim py-8 text-center">No lending markets available</p>
      ) : !hasWallet ? (
        <p className="text-sm text-text-dim py-8 text-center">Connect a wallet to deposit</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {tokens.map((token) => (
            <LendTokenCard
              key={token.jlMint}
              token={token}
              wallet={pubkey!}
              position={positionByMint.get(token.mint)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
