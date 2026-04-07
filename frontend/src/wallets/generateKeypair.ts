import { Keypair } from '@solana/web3.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export const DERIVATION_PATH = "m/44'/501'/0'/0'";

export interface GeneratedWallet {
  keypair: Keypair;
  mnemonic: string;
}

/**
 * SLIP-0010 Ed25519 HD key derivation using Web Crypto API.
 * Replaces ed25519-hd-key which pulls in Node.js-only readable-stream.
 */
async function slip10DeriveEd25519(seed: Uint8Array, path: string): Promise<Uint8Array> {
  const hmacSha512 = async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
  };

  // Master key: HMAC-SHA512("ed25519 seed", seed)
  const CURVE_BYTES = new TextEncoder().encode('ed25519 seed');
  let I = await hmacSha512(CURVE_BYTES, seed);
  let IL = I.slice(0, 32); // private key
  let IR = I.slice(32);    // chain code

  // Parse path segments, e.g. "m/44'/501'/0'/0'" → ["44'", "501'", "0'", "0'"]
  const segments = path.replace(/^m\//, '').split('/');

  for (const segment of segments) {
    const hardened = segment.endsWith("'");
    const index = (parseInt(segment, 10) + (hardened ? 0x80000000 : 0)) >>> 0;

    // SLIP-0010: data = 0x00 || IL || index (big-endian 4 bytes)
    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(IL, 1);
    new DataView(data.buffer).setUint32(33, index, false);

    I = await hmacSha512(IR, data);
    IL = I.slice(0, 32);
    IR = I.slice(32);
  }

  return IL;
}

export async function generateWallet(): Promise<GeneratedWallet> {
  const mnemonic = generateMnemonic(wordlist, 256); // 24 words
  const keypair = await mnemonicToKeypair(mnemonic);
  return { keypair, mnemonic };
}

export async function mnemonicToKeypair(mnemonic: string): Promise<Keypair> {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic phrase');
  }
  const seed = mnemonicToSeedSync(mnemonic);
  const privateKey = await slip10DeriveEd25519(seed, DERIVATION_PATH);
  return Keypair.fromSeed(privateKey);
}
