import { apiFetch } from './client';

export interface VaultStatus {
  exists: false;
}
export interface VaultData {
  exists: true;
  encrypted: string;
  pubkey: string;
}
export type VaultResponse = VaultStatus | VaultData;

export async function getVault(): Promise<VaultResponse> {
  return apiFetch<VaultResponse>('/api/vault');
}

export async function saveVault(encrypted: string, pubkey: string): Promise<void> {
  await apiFetch<{ ok: boolean }>('/api/vault', {
    method: 'POST',
    body: JSON.stringify({ encrypted, pubkey }),
  });
}

export async function deleteVault(): Promise<void> {
  await apiFetch<{ ok: boolean }>('/api/vault', { method: 'DELETE' });
}
