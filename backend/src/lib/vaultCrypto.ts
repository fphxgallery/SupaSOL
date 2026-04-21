import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const PBKDF2_ITERATIONS = 250_000;

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/** Decrypt a blob produced by the browser's encryptPrivateKey. Format: salt(16)|iv(12)|ciphertext. */
export async function decryptPrivateKey(blob: string, password: string): Promise<Uint8Array> {
  const packed = Buffer.from(blob, 'base64');
  const salt = packed.subarray(0, 16);
  const iv = packed.subarray(16, 28);
  const ciphertext = packed.subarray(28);

  const key = await deriveKey(password, salt, ['decrypt']);
  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}
