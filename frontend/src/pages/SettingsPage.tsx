import { useState } from 'react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useClusterStore } from '../store/clusterStore';
import { useSettingsStore } from '../store/settingsStore';

export function SettingsPage() {
  const { rpcUrl, setRpcUrl, cluster, setCluster } = useClusterStore();
  const { slippageBps, setSlippageBps, priorityFeeMode, setPriorityFeeMode } = useSettingsStore();
  const [rpcInput, setRpcInput] = useState(rpcUrl);

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <h1 className="text-lg font-bold text-text">Settings</h1>

      <Card>
        <CardHeader title="Network" />
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-dim font-medium">Cluster</label>
            <div className="flex gap-2">
              {(['mainnet-beta', 'devnet'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCluster(c)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    cluster === c
                      ? 'bg-green/10 text-green border border-green/30'
                      : 'bg-surface-2 text-text-dim border border-border hover:text-text'
                  }`}
                >
                  {c === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="RPC Endpoint"
            value={rpcInput}
            onChange={(e) => setRpcInput(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRpcUrl(rpcInput)}
            disabled={rpcInput === rpcUrl}
          >
            Save RPC
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Trading" />
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-dim font-medium">Slippage Tolerance</label>
            <div className="flex gap-2">
              {[10, 50, 100, 200].map((bps) => (
                <button
                  key={bps}
                  onClick={() => setSlippageBps(bps)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    slippageBps === bps
                      ? 'bg-green/10 text-green border border-green/30'
                      : 'bg-surface-2 text-text-dim border border-border hover:text-text'
                  }`}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-dim font-medium">Priority Fee</label>
            <div className="flex gap-2">
              {(['none', 'low', 'medium', 'high'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPriorityFeeMode(mode)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors capitalize cursor-pointer ${
                    priorityFeeMode === mode
                      ? 'bg-green/10 text-green border border-green/30'
                      : 'bg-surface-2 text-text-dim border border-border hover:text-text'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
