import { apiFetch } from './client';

export interface StudioCreateTxParams {
  creatorPubkey: string;
  name: string;
  symbol: string;
  decimals?: number;
  description?: string;
  uri?: string;       // metadata URI (if pre-uploaded)
  initialSupply?: number;
  mintAuthority?: string;
  freezeAuthority?: string | null;
}

export interface StudioCreateTxResponse {
  transaction: string;   // base64 VersionedTransaction
  mint: string;          // the new token mint address
  requestId: string;
  presignedUploadUrl?: string; // S3 presigned URL for image upload
  metadataUploadUrl?: string;  // S3 presigned URL for metadata JSON upload
}

export interface StudioFeeResponse {
  feeAmount: number;    // lamports
  feeMint: string;
}

export interface StudioFeeCreateTxParams {
  creatorPubkey: string;
  mint: string;
}

export interface StudioFeeCreateTxResponse {
  transaction: string;
  requestId: string;
}

export interface StudioAddressesResponse {
  poolAddress: string;
  vaultAddress: string;
  mintAuthority: string;
}

export async function studioGetFee(params: { creatorPubkey: string }): Promise<StudioFeeResponse> {
  return apiFetch<StudioFeeResponse>('/api/studio/dbc/fee', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function studioCreateTx(params: StudioCreateTxParams): Promise<StudioCreateTxResponse> {
  return apiFetch<StudioCreateTxResponse>('/api/studio/dbc-pool/create-tx', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function studioGetAddresses(mint: string): Promise<StudioAddressesResponse> {
  return apiFetch<StudioAddressesResponse>(`/api/studio/dbc-pool/addresses/${mint}`);
}
