import { useState, useCallback } from 'react';
import { useWalletStore } from '../store/walletStore';
import { useUiStore } from '../store/uiStore';
import { getTriggerChallenge, verifyTriggerAuth } from '../api/trigger';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519';

export type AuthState = 'idle' | 'authenticating' | 'authenticated' | 'error';

export function useTriggerAuth() {
  const keypair = useWalletStore((s) => s.keypair);
  const addToast = useUiStore((s) => s.addToast);
  const [authState, setAuthState] = useState<AuthState>('idle');

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!keypair) {
      addToast({ type: 'error', message: 'Connect a wallet first' });
      return false;
    }
    setAuthState('authenticating');
    try {
      const walletPubkey = keypair.publicKey.toBase58();

      // Step 1: Get challenge
      const { challenge } = await getTriggerChallenge(walletPubkey);

      // Step 2: Sign challenge with ed25519 private key (first 32 bytes of 64-byte secretKey)
      const challengeBytes = new TextEncoder().encode(challenge);
      const privateKey = keypair.secretKey.slice(0, 32);
      const signature = ed25519.sign(challengeBytes, privateKey);
      const signatureBase58 = bs58.encode(signature);

      // Step 3: Backend caches JWT on success, injects it on all future trigger requests
      await verifyTriggerAuth(walletPubkey, signatureBase58);

      setAuthState('authenticated');
      addToast({ type: 'success', message: 'Authenticated with Jupiter Trigger' });
      return true;
    } catch (e: unknown) {
      setAuthState('error');
      const msg = e instanceof Error ? e.message : 'Trigger auth failed';
      addToast({ type: 'error', message: msg });
      return false;
    }
  }, [keypair, addToast]);

  const reset = useCallback(() => setAuthState('idle'), []);

  return { authState, authenticate, reset, isAuthenticated: authState === 'authenticated' };
}
