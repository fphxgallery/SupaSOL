import { useCallback } from 'react';
import { VersionedTransaction, Connection } from '@solana/web3.js';
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

  return { signTransaction, signAndSend, hasWallet: !!keypair };
}
