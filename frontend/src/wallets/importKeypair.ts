import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { mnemonicToKeypair } from './generateKeypair';

/**
 * Import a keypair from:
 * 1. BIP39 mnemonic phrase (12 or 24 words) — async path
 * 2. Base58 private key string — sync
 * 3. JSON array of bytes (e.g. [1,2,3,...,64]) — sync
 */
export async function importKeypair(input: string): Promise<Keypair> {
  const trimmed = input.trim();

  // 1. Try mnemonic (contains spaces)
  if (trimmed.includes(' ')) {
    return mnemonicToKeypair(trimmed);
  }

  // 2. Try JSON byte array
  if (trimmed.startsWith('[')) {
    try {
      const bytes = JSON.parse(trimmed) as number[];
      if (!Array.isArray(bytes) || bytes.length !== 64) {
        throw new Error('Invalid byte array — expected 64 bytes');
      }
      return Keypair.fromSecretKey(Uint8Array.from(bytes));
    } catch {
      throw new Error('Invalid JSON keypair format');
    }
  }

  // 3. Try Base58 private key (32 or 64 bytes)
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
    if (decoded.length === 32) return Keypair.fromSeed(decoded);
    throw new Error('Invalid key length');
  } catch {
    throw new Error('Unrecognized key format — use base58, JSON bytes, or seed phrase');
  }
}
