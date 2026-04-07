import { useState } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useLendTokens, useLendPositions, useLendEarnings, useLendDeposit, useLendWithdraw } from '../hooks/useLend';
import { useSignAndSend } from '../hooks/useSignAndSend';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatUsd } from '../utils/format';
import type { LendToken } from '../api/lend';

function APYBadge({ apy }: { apy?: number }) {
  if (apy == null) return <span className="text-text-dim text-xs">—</span>;
  return <span className="text-green text-sm font-semibold">{apy.toFixed(2)}% APY</span>;
}

function LendTokenRow({ token, wallet }: { token: LendToken; wallet: string }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const deposit = useLendDeposit();
  const withdraw = useLendWithdraw();

  async function handleAction() {
    if (!amount || parseFloat(amount) <= 0) return;
    const baseAmount = Math.floor(parseFloat(amount) * Math.pow(10, token.decimals));
    if (mode === 'deposit') {
      await deposit.mutateAsync({ wallet, mint: token.mint, amount: baseAmount, symbol: token.symbol });
    } else {
      await withdraw.mutateAsync({ wallet, mint: token.mint, amount: baseAmount, symbol: token.symbol });
    }
    setAmount('');
  }

  const isLoading = deposit.isPending || withdraw.isPending;

  return (
    <div className="border border-border rounded-xl p-4 bg-surface-2 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {token.logoURI && (
            <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <div>
            <p className="text-sm font-semibold text-text">{token.symbol}</p>
            <p className="text-xs text-text-dim">{token.name}</p>
          </div>
        </div>
        <div className="text-right">
          <APYBadge apy={token.supplyApy ?? token.apy} />
          {token.tvl !== undefined && (
            <p className="text-xs text-text-dim mt-0.5">TVL: {formatUsd(token.tvl)}</p>
          )}
        </div>
      </div>
      <div className="flex gap-1.5">
        {(['deposit', 'withdraw'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-xs rounded-md capitalize cursor-pointer transition-colors ${mode === m ? 'bg-green/10 text-green border border-green/20' : 'text-text-dim hover:text-text bg-surface border border-border'}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          placeholder={`Amount (${token.symbol})`}
          className="flex-1"
        />
        <Button onClick={handleAction} loading={isLoading} disabled={!amount} size="sm">
          {mode === 'deposit' ? 'Deposit' : 'Withdraw'}
        </Button>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">Lend / Earn</h1>
        <Badge variant="blue">Jupiter Lend</Badge>
      </div>

      {/* Earnings summary */}
      {pubkey && earnings && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardBody>
              <p className="text-xs text-text-dim mb-1">Total Earned</p>
              <p className="text-xl font-bold text-green">
                {earnings.totalEarned !== undefined ? formatUsd(earnings.totalEarned) : '—'}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs text-text-dim mb-1">Active Positions</p>
              <p className="text-xl font-bold text-text">{positions?.length ?? 0}</p>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Available markets */}
        <Card>
          <CardHeader title="Available Markets" subtitle="Deposit tokens to earn yield" />
          <CardBody className="flex flex-col gap-3">
            {tokensLoading ? (
              <div className="flex items-center justify-center py-8 text-text-dim text-sm">
                <span className="animate-spin mr-2">⟳</span> Loading markets...
              </div>
            ) : tokensError ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-text-dim">Failed to load lending markets.</p>
                <Button variant="secondary" size="sm" onClick={() => refetchTokens()}>Retry</Button>
              </div>
            ) : !tokens?.length ? (
              <p className="text-sm text-text-dim py-4 text-center">No lending markets available</p>
            ) : !hasWallet ? (
              <p className="text-sm text-text-dim py-4 text-center">Connect a wallet to deposit</p>
            ) : (
              tokens.map((token) => (
                <LendTokenRow key={token.mint} token={token} wallet={pubkey!} />
              ))
            )}
          </CardBody>
        </Card>

        {/* Active positions */}
        <Card>
          <CardHeader title="My Positions" />
          <CardBody>
            {!pubkey ? (
              <p className="text-sm text-text-dim py-4 text-center">Connect a wallet to view positions</p>
            ) : !positions?.length ? (
              <p className="text-sm text-text-dim py-4 text-center">No active lending positions</p>
            ) : (
              <div className="flex flex-col gap-3">
                {positions.map((pos, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium text-text">{pos.symbol ?? pos.mint.slice(0, 8)}</p>
                      {pos.apy !== undefined && <p className="text-xs text-green">{pos.apy.toFixed(2)}% APY</p>}
                    </div>
                    <div className="text-right">
                      {pos.depositedValue !== undefined && (
                        <p className="text-sm text-text">{formatUsd(pos.depositedValue)}</p>
                      )}
                      {pos.earnedAmount !== undefined && (
                        <p className="text-xs text-green">+{pos.earnedAmount.toFixed(6)} earned</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
