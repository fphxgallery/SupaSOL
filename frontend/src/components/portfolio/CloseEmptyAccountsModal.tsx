import { useState, useCallback } from 'react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { createCloseAccountInstruction } from '@solana/spl-token';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useSignAndSend } from '../../hooks/useSignAndSend';
import { useQueryClient } from '@tanstack/react-query';
import type { EmptyTokenAccount } from '../../hooks/useEmptyTokenAccounts';

const RENT_PER_ACCOUNT_SOL = 0.00203928;
const CLOSE_PER_TX = 20;

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: EmptyTokenAccount[];
  ownerPubkey: string;
}

export function CloseEmptyAccountsModal({ open, onClose, accounts, ownerPubkey }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const { signAndSendAllLegacy } = useSignAndSend();
  const queryClient = useQueryClient();

  const allSelected = selected.size === accounts.length && accounts.length > 0;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(accounts.map((a) => a.pubkey.toBase58())));
  }

  function toggle(pubkey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pubkey) ? next.delete(pubkey) : next.add(pubkey);
      return next;
    });
  }

  const handleClose = useCallback(async () => {
    if (selected.size === 0) return;
    setClosing(true);
    try {
      const toClose = accounts.filter((a) => selected.has(a.pubkey.toBase58()));
      const chunks: EmptyTokenAccount[][] = [];
      for (let i = 0; i < toClose.length; i += CLOSE_PER_TX) {
        chunks.push(toClose.slice(i, i + CLOSE_PER_TX));
      }

      const txs = chunks.map((chunk) => {
        const tx = new Transaction();
        for (const acct of chunk) {
          tx.add(
            createCloseAccountInstruction(
              acct.pubkey,
              new PublicKey(ownerPubkey),
              new PublicKey(ownerPubkey),
              [],
              acct.programId
            )
          );
        }
        return tx;
      });

      await signAndSendAllLegacy(txs, 'Close empty accounts');
      queryClient.invalidateQueries({ queryKey: ['empty-token-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['sol-balance'] });
      onClose();
    } finally {
      setClosing(false);
    }
  }, [selected, accounts, ownerPubkey, signAndSendAllLegacy, queryClient, onClose]);

  const reclaimSol = (selected.size * RENT_PER_ACCOUNT_SOL).toFixed(5);

  return (
    <Modal open={open} onClose={closing ? undefined! : onClose} title="Close Empty Token Accounts" maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-dim">
          Select accounts to close. Rent (~0.00204 SOL each) returns to your wallet.
        </p>

        <div className="flex items-center justify-between text-xs text-text-dim border-b border-border pb-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-green w-3.5 h-3.5"
            />
            Select all ({accounts.length})
          </label>
          <span className="text-green font-medium">+{reclaimSol} SOL reclaim</span>
        </div>

        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
          {accounts.map((acct) => {
            const pubkeyStr = acct.pubkey.toBase58();
            const checked = selected.has(pubkeyStr);
            return (
              <label
                key={pubkeyStr}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-green/10 border border-green/30' : 'hover:bg-surface-2 border border-transparent'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(pubkeyStr)}
                  className="accent-green w-3.5 h-3.5 shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-mono text-text truncate">{acct.mint}</span>
                  <span className="text-xs text-text-dim font-mono truncate">{pubkeyStr}</span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onClose} disabled={closing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={handleClose}
            disabled={selected.size === 0 || closing}
          >
            {closing ? 'Closing…' : `Close ${selected.size > 0 ? selected.size : ''} Account${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
