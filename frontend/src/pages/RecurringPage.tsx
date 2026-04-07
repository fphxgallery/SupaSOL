import { useState } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useRecurringOrders, useCreateRecurring, useCancelRecurring } from '../hooks/useRecurring';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { TokenSearchPanel } from '../components/panels/TokenSearchPanel';
import type { TokenInfo } from '../hooks/useTokenSearch';
import { MINTS } from '../config/constants';
import { timeAgo } from '../utils/format';
import type { RecurringOrder } from '../api/recurring';

const SOL_TOKEN: TokenInfo = { address: MINTS.SOL, name: 'Solana', symbol: 'SOL', decimals: 9 };
const USDC_TOKEN: TokenInfo = { address: MINTS.USDC, name: 'USD Coin', symbol: 'USDC', decimals: 6 };

const INTERVALS = [
  { label: '1 hour', seconds: 3600 },
  { label: '8 hours', seconds: 28800 },
  { label: '1 day', seconds: 86400 },
  { label: '1 week', seconds: 604800 },
];

function OrderRow({ order, onCancel, pubkey }: { order: RecurringOrder; onCancel: () => void; pubkey: string }) {
  const progressPct = order.totalCycles > 0 ? (order.completedCycles / order.totalCycles) * 100 : 0;

  return (
    <div className="p-4 border-b border-border last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-text-dim">{order.inputMint.slice(0, 4)}…</span>
          <span className="text-text-dim">→</span>
          <span className="text-sm font-mono text-text-dim">{order.outputMint.slice(0, 4)}…</span>
          <Badge variant={order.status === 'active' ? 'green' : 'muted'}>{order.status}</Badge>
        </div>
        <Button variant="danger" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="flex items-center justify-between text-xs text-text-dim mb-2">
        <span>{order.completedCycles}/{order.totalCycles} orders complete</span>
        {order.nextCycleAt && <span>Next: {timeAgo(new Date(order.nextCycleAt).getTime())}</span>}
      </div>
      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-green rounded-full transition-all" style={{ width: `${progressPct}%` }} />
      </div>
    </div>
  );
}

export function RecurringPage() {
  const pubkey = useActivePublicKey();
  const { data: ordersResp, isLoading } = useRecurringOrders(pubkey);
  const { mutateAsync: createOrder, isPending: creating } = useCreateRecurring();
  const { mutateAsync: cancelOrder } = useCancelRecurring();

  const [inputToken, setInputToken] = useState<TokenInfo>(USDC_TOKEN);
  const [outputToken, setOutputToken] = useState<TokenInfo>(SOL_TOKEN);
  const [totalAmount, setTotalAmount] = useState('');
  const [numOrders, setNumOrders] = useState('10');
  const [intervalIdx, setIntervalIdx] = useState(2); // 1 day default

  const orders = ordersResp?.orders ?? [];
  const activeOrders = orders.filter((o) => o.status === 'active');

  // Validation
  const perOrderAmount = totalAmount && numOrders
    ? parseFloat(totalAmount) / parseInt(numOrders)
    : 0;
  const minTotalUsd = 100;
  const minPerOrderUsd = 50;
  const minOrders = 2;
  const isValid = parseFloat(totalAmount) >= minTotalUsd
    && parseInt(numOrders) >= minOrders
    && perOrderAmount >= minPerOrderUsd
    && !!pubkey;

  async function handleCreate() {
    if (!isValid || !pubkey) return;
    const decimals = inputToken.decimals;
    const totalBase = Math.floor(parseFloat(totalAmount) * Math.pow(10, decimals));
    const perCycleBase = Math.floor(perOrderAmount * Math.pow(10, decimals));
    await createOrder({
      userPublicKey: pubkey,
      inputMint: inputToken.address,
      outputMint: outputToken.address,
      inAmount: totalBase,
      inAmountPerCycle: perCycleBase,
      cycleSecondsApart: INTERVALS[intervalIdx]!.seconds,
    });
    setTotalAmount('');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">DCA / Recurring</h1>
        <Badge variant="purple">Jupiter Recurring</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Create form */}
        <Card className="lg:col-span-1">
          <CardHeader title="Create DCA Order" subtitle="Dollar-cost averaging" />
          <CardBody className="flex flex-col gap-4">
            <TokenSearchPanel label="Spend Token" value={inputToken} onChange={setInputToken} />
            <TokenSearchPanel label="Receive Token" value={outputToken} onChange={setOutputToken} />

            <Input
              label="Total Amount"
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder={`Min $${minTotalUsd}`}
              suffix={inputToken.symbol}
            />

            <Input
              label={`Number of Orders (min ${minOrders})`}
              type="number"
              value={numOrders}
              onChange={(e) => setNumOrders(e.target.value)}
              placeholder="10"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-dim font-medium">Interval</label>
              <div className="grid grid-cols-2 gap-1.5">
                {INTERVALS.map((iv, i) => (
                  <button
                    key={iv.label}
                    onClick={() => setIntervalIdx(i)}
                    className={`py-2 text-xs rounded-lg cursor-pointer transition-colors ${intervalIdx === i ? 'bg-purple/10 text-purple border border-purple/20' : 'bg-surface-2 text-text-dim border border-border hover:text-text'}`}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>

            {totalAmount && parseInt(numOrders) > 0 && (
              <div className="bg-surface-2 rounded-lg p-3 border border-border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-dim">Per order:</span>
                  <span className={perOrderAmount < minPerOrderUsd ? 'text-red' : 'text-text'}>
                    {perOrderAmount.toFixed(2)} {inputToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Frequency:</span>
                  <span className="text-text">{INTERVALS[intervalIdx]?.label ?? '—'}</span>
                </div>
              </div>
            )}

            {!pubkey ? (
              <p className="text-xs text-text-dim text-center">Connect a wallet to create DCA orders</p>
            ) : (
              <Button onClick={handleCreate} loading={creating} disabled={!isValid} className="w-full">
                Create DCA Order
              </Button>
            )}
          </CardBody>
        </Card>

        {/* Active orders */}
        <Card className="lg:col-span-2">
          <CardHeader title="Active DCA Orders" subtitle={`${activeOrders.length} running`} />
          <CardBody className="p-0">
            {!pubkey ? (
              <p className="text-sm text-text-dim text-center py-8">Connect a wallet to view DCA orders</p>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8 text-text-dim text-sm">
                <span className="animate-spin mr-2">⟳</span> Loading orders...
              </div>
            ) : activeOrders.length === 0 ? (
              <p className="text-sm text-text-dim text-center py-8">No active DCA orders</p>
            ) : (
              activeOrders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  pubkey={pubkey!}
                  onCancel={() => cancelOrder({ orderId: order.id, userPublicKey: pubkey! })}
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
