import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { generateWallet } from '../../wallets/generateKeypair';
import { useWalletStore } from '../../store/walletStore';
import { useUiStore } from '../../store/uiStore';
import type { Keypair } from '@solana/web3.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateWalletModal({ open, onClose }: Props) {
  const [step, setStep] = useState<'generate' | 'confirm'>('generate');
  const [mnemonic, setMnemonic] = useState('');
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const setStoreKeypair = useWalletStore((s) => s.setKeypair);
  const addToast = useUiStore((s) => s.addToast);

  async function handleGenerate(warnIfShowing = false) {
    if (warnIfShowing && mnemonic) {
      if (!window.confirm('This will replace your current phrase. Are you sure?')) return;
    }
    setLoading(true);
    setCopied(false);
    setConfirmed(false);
    try {
      const wallet = await generateWallet();
      setMnemonic(wallet.mnemonic);
      setKeypair(wallet.keypair);
      setStep('confirm');
    } catch (e: unknown) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Failed to generate wallet' });
    } finally {
      setLoading(false);
    }
  }

  function handleCopyAll() {
    navigator.clipboard.writeText(mnemonic).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleConfirm() {
    if (!keypair) return;
    setStoreKeypair(keypair);
    addToast({ type: 'success', message: 'Wallet created successfully' });
    handleClose();
  }

  function handleClose() {
    setStep('generate');
    setMnemonic('');
    setKeypair(null);
    setConfirmed(false);
    setCopied(false);
    onClose();
  }

  const words = mnemonic.split(' ');

  return (
    <Modal open={open} onClose={handleClose} title="Create New Wallet" maxWidth="max-w-lg" disableBackdropClose={step === 'confirm'}>
      {step === 'generate' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-dim">
            Generate a new Solana wallet. You'll receive a 24-word seed phrase — store it safely offline.
          </p>
          <div className="bg-orange/10 border border-orange/20 rounded-lg p-3">
            <p className="text-xs text-orange font-medium">
              ⚠ Never share your seed phrase. It gives full access to your wallet.
            </p>
          </div>
          <Button onClick={() => handleGenerate(false)} loading={loading} className="w-full">
            Generate Wallet
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-red/10 border border-red/20 rounded-lg p-3">
            <p className="text-xs text-red font-medium">
              ⚠ Write these words down now. If you close this window without saving them, they are gone forever.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-dim">Save these 24 words in order.</p>
            <button
              onClick={handleCopyAll}
              className="text-xs text-green hover:text-green/80 transition-colors font-medium"
            >
              {copied ? '✓ Copied!' : 'Copy all words'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 bg-surface-2 rounded-xl p-4 border border-border">
            {words.map((word, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted w-5 text-right shrink-0">{i + 1}.</span>
                <span className="text-sm text-text font-mono">{word}</span>
              </div>
            ))}
          </div>
          {keypair && (
            <div className="bg-surface-2 rounded-lg p-3 border border-border">
              <p className="text-xs text-text-dim mb-1">Public Key</p>
              <p className="text-xs font-mono text-text break-all">{keypair.publicKey.toBase58()}</p>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 accent-green"
            />
            <span className="text-sm text-text">I have saved my seed phrase securely</span>
          </label>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => handleGenerate(true)} loading={loading} className="flex-1">
              Regenerate
            </Button>
            <Button onClick={handleConfirm} disabled={!confirmed} className="flex-1">
              Access Wallet
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
