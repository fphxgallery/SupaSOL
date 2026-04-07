import { useState } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useTriggerOrders, useCancelTriggerOrder, useCreateTriggerOrder } from '../hooks/useTrigger';
import { useTriggerAuth } from '../hooks/useTriggerAuth';
import { TokenSearchPanel } from '../components/panels/TokenSearchPanel';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import type { TokenInfo } from '../hooks/useTokenSearch';
import type { TriggerOrder } from '../api/trigger';
import { MINTS } from '../config/constants';
import { timeAgo, shortenPubkey } from '../utils/format';

const SOL_TOKEN: TokenInfo = { address: MINTS.SOL, name: 'Solana', symbol: 'SOL', decimals: 9 };
const USDC_TOKEN: TokenInfo = { address: MINTS.USDC, name: 'USD Coin', symbol: 'USDC', decimals: 6 };

const STATUS_VARIANT: Record<string, 'green' | 'muted' | 'orange' | 'red'> = {
  open: 'orange', filled: 'green', cancelled: 'muted', expired: 'red',
};

function OrderRow({ order, onCancel, cancelling }: {
  order: TriggerOrder;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
      <div className="flex flex-col gap-1 shrink-0 w-20">
        <Badge variant={STATUS_VARIANT[order.status] ?? 'muted'}>{order.status}</Badge>
        <span className="text-xs text-text-dim">{order.orderType.toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">
          {shortenPubkey(order.inputMint, 4)} → {shortenPubkey(order.outputMint, 4)}
        </p>
        <p className="text-xs text-text-dim mt-0.5">
          Trigger {order.triggerCondition === 'above' ? '↑ above' : '↓ below'}{' '}
          <span className="text-text font-mono">{order.triggerPrice}</span>
        </p>
        <p className="text-xs text-muted mt-0.5">{timeAgo(new Date(order.createdAt).getTime())}</p>
      </div>
      {order.status === 'open' && (
        <Button variant="danger" size="sm" onClick={onCancel} loading={cancelling}>
          Cancel
        </Button>
      )}
    </div>
  );
}

type OrderType = 'single' | 'oco' | 'otoco';

export function TriggerPage() {
  const pubkey = useActivePublicKey();
  const { authState, authenticate } = useTriggerAuth();
  const { data: ordersResp, isLoading } = useTriggerOrders(pubkey);
  const { mutateAsync: cancelOrder, isPending: cancelling, variables: cancelVars } = useCancelTriggerOrder();
  const { mutateAsync: createOrder, isPending: creating } = useCreateTriggerOrder();

  const [inputToken, setInputToken] = useState<TokenInfo>(SOL_TOKEN);
  const [outputToken, setOutputToken] = useState<TokenInfo>(USDC_TOKEN);
  const [inAmount, setInAmount] = useState('');
  const [outAmount, setOutAmount] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [orderType, setOrderType] = useState<OrderType>('single');

  const orders = ordersResp?.orders ?? [];
  const openOrders = orders.filter((o) => o.status === 'open');
  const historyOrders = orders.filter((o) => o.status !== 'open');

  const isAuthed = authState === 'authenticated';
  const isAuthing = authState === 'authenticating';

  async function handleCreate() {
    if (!pubkey || !inAmount || !outAmount || !triggerPrice) return;
    await createOrder({
      walletPubkey: pubkey,
      inputMint: inputToken.address,
      outputMint: outputToken.address,
      inAmount: Math.floor(parseFloat(inAmount) * Math.pow(10, inputToken.decimals)),
      outAmount: Math.floor(parseFloat(outAmount) * Math.pow(10, outputToken.decimals)),
      triggerPrice,
      triggerCondition: condition,
      orderType,
    });
    setInAmount(''); setOutAmount(''); setTriggerPrice('');
  }

  const formValid = !!pubkey && !!inAmount && !!outAmount && !!triggerPrice && parseFloat(inAmount) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">Limit Orders</h1>
        <Badge variant="orange">Jupiter Trigger v2</Badge>
        {isAuthed && <Badge variant="green">● Authenticated</Badge>}
      </div>

      {/* Auth banner */}
      {pubkey && !isAuthed && (
        <div className="flex items-center justify-between bg-blue/10 border border-blue/20 rounded-xl p-4">
          <div>
            <p className="text-sm text-blue font-medium">Authentication required</p>
            <p className="text-xs text-text-dim mt-0.5">
              Jupiter Trigger uses an off-chain vault. Sign a challenge to enable limit orders.
            </p>
          </div>
          <Button size="sm" onClick={authenticate} loading={isAuthing}>
            Authenticate
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Order form */}
        <Card className="lg:col-span-1">
          <CardHeader title="Place Order" subtitle="Min $10 USD equivalent" />
          <CardBody className="flex flex-col gap-4">
            {!pubkey ? (
              <p className="text-sm text-text-dim text-center py-4">Connect a wallet to place limit orders</p>
            ) : (
              <>
                {/* Order type */}
                <div className="flex gap-1.5">
                  {(['single', 'oco', 'otoco'] as OrderType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setOrderType(t)}
                      className={`flex-1 py-1.5 text-xs rounded-md uppercase font-medium cursor-pointer transition-colors ${orderType === t ? 'bg-orange/10 text-orange border border-orange/20' : 'bg-surface-2 text-text-dim border border-border hover:text-text'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <TokenSearchPanel label="Sell Token" value={inputToken} onChange={setInputToken} />
                <Input
                  label={`Sell Amount (${inputToken.symbol})`}
                  type="number" value={inAmount}
                  onChange={(e) => setInAmount(e.target.value)}
                  placeholder="0.00" suffix={inputToken.symbol}
                />

                <TokenSearchPanel label="Buy Token" value={outputToken} onChange={setOutputToken} />
                <Input
                  label={`Min Receive (${outputToken.symbol})`}
                  type="number" value={outAmount}
                  onChange={(e) => setOutAmount(e.target.value)}
                  placeholder="0.00" suffix={outputToken.symbol}
                />

                {/* Trigger condition */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-dim font-medium">Trigger When Price Is</label>
                  <div className="flex gap-1.5">
                    {(['above', 'below'] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setCondition(c)}
                        className={`flex-1 py-2 text-xs rounded-lg capitalize cursor-pointer transition-colors ${condition === c ? (c === 'above' ? 'bg-green/10 text-green border border-green/20' : 'bg-red/10 text-red border border-red/20') : 'bg-surface-2 text-text-dim border border-border hover:text-text'}`}
                      >
                        {c === 'above' ? '↑ Above' : '↓ Below'}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Trigger Price (USD)"
                  type="number" value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  placeholder="e.g. 200.00" prefix="$"
                />

                {!isAuthed ? (
                  <Button onClick={authenticate} loading={isAuthing} variant="secondary" className="w-full">
                    Authenticate to Place Order
                  </Button>
                ) : (
                  <Button onClick={handleCreate} loading={creating} disabled={!formValid} className="w-full">
                    Place {orderType.toUpperCase()} Order
                  </Button>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* Open orders */}
        <Card className="lg:col-span-2">
          <CardHeader title="Open Orders" subtitle={pubkey ? `${openOrders.length} active` : 'Connect wallet'} />
          <CardBody className="p-0">
            {!pubkey ? (
              <p className="text-sm text-text-dim text-center py-8">Connect a wallet to view orders</p>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8 text-text-dim">
                <span className="animate-spin mr-2 text-lg">⟳</span>
                <span className="text-sm">Loading orders...</span>
              </div>
            ) : openOrders.length === 0 ? (
              <p className="text-sm text-text-dim text-center py-8">No open limit orders</p>
            ) : (
              openOrders.map((order) => (
                <OrderRow
                  key={order.id} order={order}
                  cancelling={cancelling && cancelVars?.orderId === order.id}
                  onCancel={() => cancelOrder({ orderId: order.id, walletPubkey: pubkey! })}
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {/* History */}
      {historyOrders.length > 0 && (
        <Card>
          <CardHeader title="Order History" subtitle={`${historyOrders.length} orders`} />
          <CardBody className="p-0">
            {historyOrders.map((order) => (
              <OrderRow key={order.id} order={order} onCancel={() => {}} cancelling={false} />
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
