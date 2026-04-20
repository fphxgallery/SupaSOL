import { useState } from 'react';
import { Keypair } from '@solana/web3.js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useWalletStore } from '../../store/walletStore';
import { useUiStore } from '../../store/uiStore';
import { encryptPrivateKey, decryptPrivateKey } from '../../lib/vaultCrypto';
import { saveVault, deleteVault } from '../../api/vault';
import { useInvalidateVault } from '../../hooks/useVaultStatus';
import type { VaultData } from '../../api/vault';

// ── Save mode ────────────────────────────────────────────────────────────────

interface SaveProps {
  open: boolean;
  onClose: () => void;
}

export function SaveToVaultModal({ open, onClose }: SaveProps) {
  const keypair     = useWalletStore((s) => s.keypair);
  const addToast    = useUiStore((s) => s.addToast);
  const invalidate  = useInvalidateVault();

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleSave() {
    if (!keypair) return;
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError('');
    try {
      const encrypted = await encryptPrivateKey(keypair.secretKey, password);
      await saveVault(encrypted, keypair.publicKey.toBase58());
      invalidate();
      addToast({ type: 'success', message: 'Wallet saved to vault' });
      setPassword('');
      setConfirm('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vault');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setPassword('');
    setConfirm('');
    setError('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Save Wallet to Vault">
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-surface-2 border border-border p-3 text-xs text-text-dim space-y-1">
          <p>Your private key is encrypted in the browser before being sent to the backend.</p>
          <p>The server only stores the encrypted blob — your password never leaves this tab.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-dim">Vault password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-green/50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-dim">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-green/50"
          />
        </div>

        {error && <p className="text-xs text-red">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={handleSave} disabled={loading || !password || !confirm}>
            {loading ? 'Encrypting…' : 'Save to Vault'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Unlock mode ──────────────────────────────────────────────────────────────

interface UnlockProps {
  open: boolean;
  onClose: () => void;
  vaultData: VaultData;
}

export function UnlockVaultModal({ open, onClose, vaultData }: UnlockProps) {
  const setKeypair   = useWalletStore((s) => s.setKeypair);
  const addToast     = useUiStore((s) => s.addToast);
  const invalidate   = useInvalidateVault();

  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleUnlock() {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const secretKey = await decryptPrivateKey(vaultData.encrypted, password);
      const keypair   = Keypair.fromSecretKey(secretKey);

      if (keypair.publicKey.toBase58() !== vaultData.pubkey) {
        setError('Decrypted key does not match stored pubkey. Vault may be corrupt.');
        return;
      }

      setKeypair(keypair);
      addToast({ type: 'success', message: 'Wallet unlocked' });
      setPassword('');
      onClose();
    } catch {
      setError('Wrong password or corrupt vault.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete the vault? This cannot be undone.')) return;
    try {
      await deleteVault();
      invalidate();
      onClose();
    } catch {
      setError('Failed to delete vault. Try again.');
    }
  }

  function handleClose() {
    setPassword('');
    setError('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Unlock Wallet">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="font-mono bg-surface-2 px-2 py-0.5 rounded border border-border truncate">
            {vaultData.pubkey.slice(0, 8)}…{vaultData.pubkey.slice(-8)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-dim">Vault password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            placeholder="Enter your vault password"
            autoFocus
            className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-green/50"
          />
        </div>

        {error && <p className="text-xs text-red">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={handleUnlock} disabled={loading || !password}>
            {loading ? 'Decrypting…' : 'Unlock'}
          </Button>
        </div>

        <button
          onClick={handleDelete}
          className="text-xs text-text-dim hover:text-red transition-colors text-center"
        >
          Delete vault
        </button>
      </div>
    </Modal>
  );
}
