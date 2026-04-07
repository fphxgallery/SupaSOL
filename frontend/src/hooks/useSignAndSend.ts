import { useCallback } from 'react';
import { VersionedTransaction, Transaction, Connection, Signer } from '@solana/web3.js';
import { useWalletStore } from '../store/walletStore';
import { useClusterStore } from '../store/clusterStore';
import { useTxStore } from '../store/txStore';
import { useUiStore } from '../store/uiStore';

export function useSignAndSend() {
  const keypair = useWalletStore((s) => s.keypair);
  const rpcUrl = useClusterStore((s) => s.rpcUrl);
  const cluster = useClusterStore((s) => s.cluster);
  const addTx = useTxStore((s) => s.addTx);
  const addToast = useUiStore((s) => s.addToast);

  const signTransaction = useCallback(async (txBase64: string): Promise<string> => {
    if (!keypair) throw new Error('No wallet connected');

    const txBytes = Buffer.from(txBase64, 'base64');
    const tx = VersionedTransaction.deserialize(txBytes);
    tx.sign([keypair]);
    return Buffer.from(tx.serialize()).toString('base64');
  }, [keypair]);

  const signAndSend = useCallback(async (
    txBase64: string,
    description: string = 'Transaction'
  ): Promise<string> => {
    if (!keypair) throw new Error('No wallet connected');

    const txBytes = Buffer.from(txBase64, 'base64');
    const tx = VersionedTransaction.deserialize(txBytes);
    tx.sign([keypair]);

    const connection = new Connection(rpcUrl, 'confirmed');
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      maxRetries: 0,
      skipPreflight: true,
    });

    addTx({ sig, status: 'pending', description, cluster });
    addToast({ type: 'info', message: `${description} submitted`, txSig: sig });

    // Confirm in background
    connection.confirmTransaction(sig, 'confirmed').then(() => {
      useTxStore.getState().updateTx(sig, 'confirmed');
      useUiStore.getState().addToast({ type: 'success', message: `${description} confirmed`, txSig: sig });
    }).catch(() => {
      useTxStore.getState().updateTx(sig, 'failed');
      useUiStore.getState().addToast({ type: 'error', message: `${description} failed` });
    });

    return sig;
  }, [keypair, rpcUrl, cluster, addTx, addToast]);

  /**
   * Sign and send a legacy (non-versioned) Transaction.
   * Used for Meteora DLMM SDK which returns legacy Transaction objects.
   *
   * extraSigners — additional Keypairs (e.g. DLMM position keypairs) that must co-sign.
   * They are signed AFTER the blockhash is set so the signatures cover the correct message.
   * Do NOT pre-sign with these keypairs before calling this function.
   */
  const signAndSendLegacy = useCallback(async (
    tx: Transaction,
    description: string = 'Transaction',
    extraSigners: Signer[] = []
  ): Promise<string> => {
    if (!keypair) throw new Error('No wallet connected');

    const connection = new Connection(rpcUrl, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    // Sign with extra keypairs first (e.g. position keypairs), then the user wallet
    if (extraSigners.length > 0) tx.partialSign(...extraSigners);
    tx.partialSign(keypair);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      maxRetries: 0,
      skipPreflight: true,
    });

    addTx({ sig, status: 'pending', description, cluster });
    addToast({ type: 'info', message: `${description} submitted`, txSig: sig });

    connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed').then(() => {
      useTxStore.getState().updateTx(sig, 'confirmed');
      useUiStore.getState().addToast({ type: 'success', message: `${description} confirmed`, txSig: sig });
    }).catch(() => {
      useTxStore.getState().updateTx(sig, 'failed');
      useUiStore.getState().addToast({ type: 'error', message: `${description} failed` });
    });

    return sig;
  }, [keypair, rpcUrl, cluster, addTx, addToast]);

  /**
   * Sign and send multiple legacy transactions sequentially.
   * Shows (1/N), (2/N) in toasts.
   *
   * extraSignersPerTx — optional array of extra Signer arrays, one per transaction.
   */
  const signAndSendAllLegacy = useCallback(async (
    txs: Transaction[],
    description: string = 'Transaction',
    extraSignersPerTx: Signer[][] = []
  ): Promise<string[]> => {
    const sigs: string[] = [];
    for (let i = 0; i < txs.length; i++) {
      const label = txs.length > 1 ? `${description} (${i + 1}/${txs.length})` : description;
      const sig = await signAndSendLegacy(txs[i], label, extraSignersPerTx[i] ?? []);
      sigs.push(sig);
    }
    return sigs;
  }, [signAndSendLegacy]);

  return { signTransaction, signAndSend, signAndSendLegacy, signAndSendAllLegacy, hasWallet: !!keypair };
}
