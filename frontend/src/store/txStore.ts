import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TxStatus = 'pending' | 'confirmed' | 'failed';

export interface TxRecord {
  sig: string;
  status: TxStatus;
  description: string;
  ts: number;
  cluster: string;
}

interface TxState {
  txs: TxRecord[];
  addTx: (tx: Omit<TxRecord, 'ts'>) => void;
  updateTx: (sig: string, status: TxStatus) => void;
  clearTxs: () => void;
}

export const useTxStore = create<TxState>()(
  persist(
    (set) => ({
      txs: [],
      addTx: (tx) => set((s) => ({ txs: [{ ...tx, ts: Date.now() }, ...s.txs].slice(0, 100) })),
      updateTx: (sig, status) =>
        set((s) => ({ txs: s.txs.map((t) => (t.sig === sig ? { ...t, status } : t)) })),
      clearTxs: () => set({ txs: [] }),
    }),
    { name: 'ftb-txs' }
  )
);
