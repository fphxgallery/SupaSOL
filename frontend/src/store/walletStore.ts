import { create } from 'zustand';
import { Keypair } from '@solana/web3.js';

interface WalletState {
  keypair: Keypair | null;
  // Set a keypair (from generate or import)
  setKeypair: (keypair: Keypair) => void;
  // Clear the wallet (logout)
  clearKeypair: () => void;
}

// In-memory only — never persisted to localStorage
export const useWalletStore = create<WalletState>()((set) => ({
  keypair: null,
  setKeypair: (keypair) => set({ keypair }),
  clearKeypair: () => set({ keypair: null }),
}));

export function useActivePublicKey(): string | null {
  const keypair = useWalletStore((s) => s.keypair);
  return keypair ? keypair.publicKey.toBase58() : null;
}
