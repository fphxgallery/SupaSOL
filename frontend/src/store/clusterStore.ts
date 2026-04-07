import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RPC_URL, CLUSTER } from '../config/constants';

interface ClusterState {
  rpcUrl: string;
  cluster: 'mainnet-beta' | 'devnet';
  customRpcUrl: string;
  setRpcUrl: (url: string) => void;
  setCluster: (cluster: 'mainnet-beta' | 'devnet') => void;
  setCustomRpcUrl: (url: string) => void;
}

export const useClusterStore = create<ClusterState>()(
  persist(
    (set) => ({
      rpcUrl: RPC_URL,
      cluster: CLUSTER,
      customRpcUrl: '',
      setRpcUrl: (rpcUrl) => set({ rpcUrl }),
      setCluster: (cluster) => set({ cluster }),
      setCustomRpcUrl: (customRpcUrl) => set({ customRpcUrl }),
    }),
    { name: 'ftb-cluster' }
  )
);
