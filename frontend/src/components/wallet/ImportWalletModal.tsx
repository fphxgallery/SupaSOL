import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { importKeypair } from '../../wallets/importKeypair';
import { useWalletStore } from '../../store/walletStore';
import { useUiStore } from '../../store/uiStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'phrase' | 'key';

export function ImportWalletModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('phrase');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setKeypair = useWalletStore((s) => s.setKeypair);
  const addToast = useUiStore((s) => s.addToast);

  async function handleImport() {
    setError('');
    setLoading(true);
    try {
      const keypair = await importKeypair(value.trim());
      setKeypair(keypair);
      addToast({ type: 'success', message: `Wallet imported: ${keypair.publicKey.toBase58().slice(0, 8)}...` });
      setValue('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to import wallet');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setValue('');
    setError('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Wallet" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex bg-surface-2 rounded-lg p-1 gap-1">
          {(['phrase', 'key'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setValue(''); setError(''); }}
              className={`flex-1 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                tab === t ? 'bg-surface text-text font-medium' : 'text-text-dim hover:text-text'
              }`}
            >
              {t === 'phrase' ? 'Seed Phrase' : 'Private Key'}
            </button>
          ))}
        </div>

        {tab === 'phrase' ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-dim font-medium">12 or 24-word seed phrase</label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="word1 word2 word3 ..."
              rows={4}
              className="w-full bg-surface-2 border border-border rounded-lg text-sm text-text placeholder-muted focus:outline-none focus:border-blue transition-colors p-3 resize-none font-mono"
            />
          </div>
        ) : (
          <Input
            label="Base58 private key or JSON byte array"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter private key..."
            type="password"
          />
        )}

        {error && <p className="text-xs text-red">{error}</p>}

        <div className="bg-red/10 border border-red/20 rounded-lg p-3">
          <p className="text-xs text-red">
            Never enter your keys on untrusted sites. Your key never leaves your device.
          </p>
        </div>

        <Button onClick={handleImport} disabled={!value.trim()} loading={loading} className="w-full">
          Import Wallet
        </Button>
      </div>
    </Modal>
  );
}
