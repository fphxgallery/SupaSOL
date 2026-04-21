import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { unlockBot } from '../../api/bot';
import { useInvalidateBotStatus } from '../../hooks/useBackgroundBot';
import { useUiStore } from '../../store/uiStore';
import type { BotConfig } from '../../store/botStore';
import type { VaultData } from '../../api/vault';

interface Props {
  open: boolean;
  onClose: () => void;
  vaultData: VaultData;
  config: BotConfig;
}

export function UnlockBotModal({ open, onClose, vaultData, config }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const addToast = useUiStore((s) => s.addToast);
  const invalidate = useInvalidateBotStatus();

  async function handleStart() {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await unlockBot(password, config);
      invalidate();
      addToast({ type: 'success', message: 'Background bot started' });
      setPassword('');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('401') || msg.toLowerCase().includes('invalid') ? 'Wrong password.' : msg);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setPassword('');
    setError('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Run Bot in Background">
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-surface-2 border border-border p-3 text-xs text-text-dim space-y-1">
          <p>The backend will decrypt your vault key and run the bot continuously — even when this tab is closed.</p>
          <p>Your password is used once to decrypt the key and is never stored.</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="font-mono bg-surface-2 px-2 py-0.5 rounded border border-border">
            {vaultData.pubkey.slice(0, 8)}…{vaultData.pubkey.slice(-8)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-dim">Vault password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder="Enter your vault password"
            autoFocus
            className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:border-green/50"
          />
        </div>

        {error && <p className="text-xs text-red">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={handleStart} disabled={loading || !password}>
            {loading ? 'Starting…' : 'Start Background Bot'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
