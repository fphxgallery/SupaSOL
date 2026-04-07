import { useTxStore } from '../store/txStore';
import { useClusterStore } from '../store/clusterStore';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { timeAgo, shortenPubkey } from '../utils/format';

export function HistoryPage() {
  const txs = useTxStore((s) => s.txs);
  const clearTxs = useTxStore((s) => s.clearTxs);
  const cluster = useClusterStore((s) => s.cluster);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-text">Transaction History</h1>
        {txs.length > 0 && (
          <button onClick={clearTxs} className="text-xs text-text-dim hover:text-red transition-colors">
            Clear All
          </button>
        )}
      </div>
      <Card>
        <CardHeader title="Recent Transactions" subtitle={`${txs.length} transactions`} />
        <CardBody className="p-0">
          {txs.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-dim">No transactions yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {txs.map((tx) => (
                <div key={tx.sig} className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-text">{tx.description}</span>
                    <a
                      href={`https://solscan.io/tx/${tx.sig}?cluster=${cluster}`}
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
    </div>
  );
}
