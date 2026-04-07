import { useTxStore } from '../store/txStore';
import { useClusterStore } from '../store/clusterStore';
import { useActivePublicKey } from '../store/walletStore';
import { useOnChainHistory } from '../hooks/useOnChainHistory';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Skeleton, SkeletonRow } from '../components/ui/Skeleton';
import { timeAgo, shortenPubkey } from '../utils/format';

export function HistoryPage() {
  const txs     = useTxStore((s) => s.txs);
  const clearTxs = useTxStore((s) => s.clearTxs);
  const cluster = useClusterStore((s) => s.cluster);
  const pubkey  = useActivePublicKey();

  const { data: onChainTxs, isLoading: onChainLoading, isError: onChainError, refetch: refetchOnChain } =
    useOnChainHistory(pubkey);

  const explorerBase = `https://solscan.io`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-text">Transaction History</h1>
        {txs.length > 0 && (
          <button onClick={clearTxs} className="text-xs text-text-dim hover:text-red transition-colors">
            Clear App History
          </button>
        )}
      </div>

      {/* App transactions (local store) */}
      <Card>
        <CardHeader title="App Transactions" subtitle={`${txs.length} transactions`} />
        <CardBody className="p-0">
          {txs.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-dim">No transactions yet. Swap, lend, or DCA to get started.</div>
          ) : (
            <div className="divide-y divide-border">
              {txs.map((tx) => (
                <div key={tx.sig} className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-text">{tx.description}</span>
                    <a
                      href={`${explorerBase}/tx/${tx.sig}?cluster=${cluster}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue hover:underline font-mono"
                    >
                      {shortenPubkey(tx.sig, 6)}
                    </a>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={tx.status === 'confirmed' ? 'green' : tx.status === 'failed' ? 'red' : 'muted'}>
                      {tx.status}
                    </Badge>
                    <span className="text-xs text-text-dim">{timeAgo(tx.ts)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* On-chain history */}
      <Card>
        <CardHeader
          title="On-Chain History"
          subtitle={pubkey ? 'Last 50 signatures from Solana RPC' : 'Connect a wallet to view'}
        />
        <CardBody className="p-0">
          {!pubkey ? (
            <div className="p-8 text-center text-sm text-text-dim">Connect a wallet to load on-chain history.</div>
          ) : onChainLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : onChainError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center px-4">
              <p className="text-sm text-text-dim">Failed to load on-chain history. The public RPC may be rate-limiting.</p>
              <Button variant="secondary" size="sm" onClick={() => refetchOnChain()}>
                Retry
              </Button>
            </div>
          ) : !onChainTxs?.length ? (
            <div className="p-8 text-center text-sm text-text-dim">No transactions found for this address.</div>
          ) : (
            <div className="divide-y divide-border">
              {onChainTxs.map((tx) => (
                <div key={tx.signature} className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {tx.memo && <span className="text-sm text-text">{tx.memo}</span>}
                    <a
                      href={`${explorerBase}/tx/${tx.signature}?cluster=${cluster}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue hover:underline font-mono"
                    >
                      {shortenPubkey(tx.signature, 6)}
                    </a>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={tx.err === null ? 'green' : 'red'}>
                      {tx.err === null ? 'success' : 'failed'}
                    </Badge>
                    <span className="text-xs text-text-dim">
                      {tx.blockTime ? timeAgo(tx.blockTime * 1000) : 'Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
