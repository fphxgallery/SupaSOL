const PBKDF2_ITERATIONS = 250_000;

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/** Encrypt a 64-byte Solana secretKey. Returns base64 blob: salt(16)|iv(12)|ciphertext. */
export async function encryptPrivateKey(secretKey: Uint8Array, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt, ['encrypt']);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secretKey);

  const packed = new Uint8Array(16 + 12 + ciphertext.byteLength);
  packed.set(salt, 0);
  packed.set(iv, 16);
  packed.set(new Uint8Array(ciphertext), 28);

  return btoa(String.fromCharCode(...packed));
}

/** Decrypt a blob produced by encryptPrivateKey. Throws on wrong password (AES-GCM auth failure). */
export async function decryptPrivateKey(blob: string, password: string): Promise<Uint8Array> {
  const packed     = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const salt       = packed.slice(0, 16);
  const iv         = packed.slice(16, 28);
  const ciphertext = packed.slice(28);

  const key = await deriveKey(password, salt, ['decrypt']);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}
