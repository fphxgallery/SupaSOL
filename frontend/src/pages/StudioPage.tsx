import { useState, useRef } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useCreateToken, useStudioFee, type CreateTokenFormData } from '../hooks/useStudio';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatUsd } from '../utils/format';
import { EXPLORER_BASE } from '../config/constants';
import { useClusterStore } from '../store/clusterStore';

const STEPS = ['Token Details', 'Supply & Authorities', 'Review & Deploy'] as const;
type Step = 0 | 1 | 2;

function StepIndicator({ current, steps }: { current: Step; steps: readonly string[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < current
                  ? 'bg-green text-bg'
                  : i === current
                  ? 'bg-green/20 text-green border border-green'
                  : 'bg-surface-2 text-text-dim border border-border'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] whitespace-nowrap ${i === current ? 'text-green' : 'text-text-dim'}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-px mx-1 mb-4 ${i < current ? 'bg-green' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export function StudioPage() {
  const pubkey = useActivePublicKey();
  const cluster = useClusterStore((s) => s.cluster);
  const { data: feeData } = useStudioFee(pubkey);
  const { mutateAsync: createToken, isPending: creating } = useCreateToken();

  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<CreateTokenFormData>({
    name: '',
    symbol: '',
    decimals: 6,
    description: '',
    imageFile: undefined,
    initialSupply: 1_000_000_000,
    revokeMint: true,
    revokeFreeze: true,
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ sig: string; mint: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof CreateTokenFormData>(key: K, val: CreateTokenFormData[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    update('imageFile', file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDeploy() {
    if (!pubkey) return;
    try {
      const res = await createToken({ creatorPubkey: pubkey, form });
      setResult(res);
    } catch {
      // toast handled inside hook
    }
  }

  const step0Valid = form.name.trim().length > 0 && form.symbol.trim().length > 0;
  const step1Valid = form.initialSupply > 0;

  if (!pubkey) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <p className="text-text-dim">Connect a wallet to use Studio</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-text">Studio</h1>
          <Badge variant="green">Token Created!</Badge>
        </div>
        <Card>
          <CardBody className="flex flex-col items-center gap-4 py-8">
            <div className="text-5xl">🎉</div>
            <div className="text-center">
              <p className="text-lg font-bold text-text">{form.symbol} deployed successfully</p>
              <p className="text-sm text-text-dim mt-1">Your token is live on Solana</p>
            </div>
            <div className="w-full flex flex-col gap-2 bg-surface-2 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim">Mint Address</span>
                <code className="text-xs text-text font-mono">{result.mint.slice(0, 20)}…</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim">Transaction</span>
                <a
                  href={`${EXPLORER_BASE}/tx/${result.sig}?cluster=${cluster}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue hover:underline font-mono"
                >
                  {result.sig.slice(0, 16)}… ↗
                </a>
              </div>
            </div>
            <div className="flex gap-3 w-full">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setResult(null);
                  setStep(0);
                  setForm({ name: '', symbol: '', decimals: 6, description: '', imageFile: undefined, initialSupply: 1_000_000_000, revokeMint: true, revokeFreeze: true });
                  setImagePreview(null);
                }}
              >
                Create Another
              </Button>
              <a
                href={`https://jup.ag/studio/${result.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button className="w-full">View on Jupiter Studio ↗</Button>
              </a>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">Studio</h1>
        <Badge variant="orange">Jupiter Studio v1</Badge>
        {feeData && (
          <span className="text-xs text-text-dim ml-auto">
            Deploy fee: ~{(feeData.feeAmount / 1e9).toFixed(4)} SOL
          </span>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex justify-center py-2">
        <StepIndicator current={step} steps={STEPS} />
      </div>

      {/* Step 0: Token Details */}
      {step === 0 && (
        <Card>
          <CardHeader title="Token Details" subtitle="Basic information about your token" />
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Token Name"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Flash Token"
              />
              <Input
                label="Symbol"
                value={form.symbol}
                onChange={(e) => update('symbol', e.target.value.toUpperCase().slice(0, 10))}
                placeholder="e.g. FLASH"
              />
            </div>

            <div>
              <label className="text-xs text-text-dim font-medium block mb-1.5">Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Describe your token..."
                rows={3}
                className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-blue resize-none"
              />
            </div>

            {/* Image upload */}
            <div>
              <label className="text-xs text-text-dim font-medium block mb-1.5">Token Image (optional)</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-blue/50 transition-colors"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-text-dim">
                    <span className="text-3xl">🖼</span>
                    <span className="text-xs">Click to upload PNG/JPG (max 1MB)</span>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={handleImageChange}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} disabled={!step0Valid}>
                Next: Supply & Authorities →
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 1: Supply & Authorities */}
      {step === 1 && (
        <Card>
          <CardHeader title="Supply & Authorities" subtitle="Configure token economics and permissions" />
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Initial Supply"
                type="number"
                value={String(form.initialSupply)}
                onChange={(e) => update('initialSupply', parseInt(e.target.value) || 0)}
                placeholder="1000000000"
              />
              <div>
                <label className="text-xs text-text-dim font-medium block mb-1.5">Decimals</label>
                <div className="flex gap-1.5">
                  {[0, 2, 6, 9].map((d) => (
                    <button
                      key={d}
                      onClick={() => update('decimals', d)}
                      className={`flex-1 py-2 text-xs rounded-lg font-medium cursor-pointer transition-colors ${
                        form.decimals === d
                          ? 'bg-blue/10 text-blue border border-blue/20'
                          : 'bg-surface-2 text-text-dim border border-border hover:text-text'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Authority settings */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-text-dim font-medium">Authority Settings</p>
              <div className="flex flex-col gap-2">
                {[
                  { key: 'revokeMint' as const, label: 'Revoke Mint Authority', desc: 'Prevents minting new tokens after deploy. Recommended for trust.' },
                  { key: 'revokeFreeze' as const, label: 'Revoke Freeze Authority', desc: 'Prevents freezing token accounts. Recommended for trust.' },
                ].map(({ key, label, desc }) => (
                  <div
                    key={key}
                    onClick={() => update(key, !form[key])}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      form[key]
                        ? 'bg-green/5 border-green/30'
                        : 'bg-surface-2 border-border hover:border-border'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      form[key] ? 'bg-green border-green' : 'border-border'
                    }`}>
                      {form[key] && <span className="text-[10px] text-bg font-bold">✓</span>}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">{label}</p>
                      <p className="text-xs text-text-dim">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(0)}>← Back</Button>
              <Button onClick={() => setStep(2)} disabled={!step1Valid}>
                Next: Review →
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 2: Review & Deploy */}
      {step === 2 && (
        <Card>
          <CardHeader title="Review & Deploy" subtitle="Confirm your token details before deploying" />
          <CardBody className="flex flex-col gap-4">
            {/* Preview */}
            <div className="flex items-center gap-4 bg-surface-2 rounded-xl p-4">
              {imagePreview ? (
                <img src={imagePreview} alt="token" className="w-14 h-14 rounded-full object-cover border border-border" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center">
                  <span className="text-lg font-bold text-text-dim">{form.symbol[0] ?? '?'}</span>
                </div>
              )}
              <div>
                <p className="text-lg font-bold text-text">{form.name || '—'}</p>
                <p className="text-sm text-text-dim">{form.symbol || '—'}</p>
              </div>
            </div>

            {/* Details table */}
            <div className="flex flex-col divide-y divide-border">
              {[
                { label: 'Initial Supply', value: form.initialSupply.toLocaleString() },
                { label: 'Decimals', value: String(form.decimals) },
                { label: 'Mint Authority', value: form.revokeMint ? 'Revoked after deploy' : 'Retained' },
                { label: 'Freeze Authority', value: form.revokeFreeze ? 'Revoked after deploy' : 'Retained' },
                { label: 'Deploy Fee', value: feeData ? `~${(feeData.feeAmount / 1e9).toFixed(4)} SOL` : 'Loading…' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-text-dim">{label}</span>
                  <span className="text-sm text-text font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 bg-orange/10 border border-orange/20 rounded-xl p-3">
              <span className="text-orange text-sm mt-0.5">⚠</span>
              <p className="text-xs text-orange">
                This action is irreversible. Your wallet will be charged the deploy fee plus Solana network fees.
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={handleDeploy} loading={creating}>
                Deploy Token
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
