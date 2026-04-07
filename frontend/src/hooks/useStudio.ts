import { useMutation, useQuery } from '@tanstack/react-query';
import { useSignAndSend } from './useSignAndSend';
import { useUiStore } from '../store/uiStore';
import {
  studioCreateTx, studioGetFee, studioGetAddresses,
  type StudioCreateTxParams,
} from '../api/studio';
import { apiFetch } from '../api/client';

export interface CreateTokenFormData {
  name: string;
  symbol: string;
  decimals: number;
  description: string;
  imageFile?: File;
  initialSupply: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
}

export function useStudioFee(creatorPubkey: string | null) {
  return useQuery({
    queryKey: ['studio-fee', creatorPubkey],
    queryFn: () => studioGetFee({ creatorPubkey: creatorPubkey! }),
    enabled: !!creatorPubkey,
    staleTime: 60_000,
    retry: false,
  });
}

export function useStudioAddresses(mint: string | null) {
  return useQuery({
    queryKey: ['studio-addresses', mint],
    queryFn: () => studioGetAddresses(mint!),
    enabled: !!mint,
    retry: false,
  });
}

export function useCreateToken() {
  const { signAndSend } = useSignAndSend();
  const addToast = useUiStore((s) => s.addToast);

  return useMutation({
    mutationFn: async ({
      creatorPubkey,
      form,
    }: {
      creatorPubkey: string;
      form: CreateTokenFormData;
    }) => {
      // Step 1: Upload image if provided
      let imageUri: string | undefined;
      if (form.imageFile) {
        // Get presigned URL from our backend
        const { uploadUrl, finalUrl } = await apiFetch<{ uploadUrl: string; finalUrl: string }>(
          '/api/studio/dbc-pool/image-upload-url',
          {
            method: 'POST',
            body: JSON.stringify({
              fileName: form.imageFile.name,
              contentType: form.imageFile.type,
            }),
          }
        );
        await fetch(uploadUrl, {
          method: 'PUT',
          body: form.imageFile,
          headers: { 'Content-Type': form.imageFile.type },
        });
        imageUri = finalUrl;
      }

      // Step 2: Build metadata URI (upload JSON)
      let metadataUri: string | undefined;
      if (form.name && form.symbol) {
        const metadata = {
          name: form.name,
          symbol: form.symbol,
          description: form.description,
          image: imageUri,
        };
        const { uploadUrl, finalUrl } = await apiFetch<{ uploadUrl: string; finalUrl: string }>(
          '/api/studio/dbc-pool/metadata-upload-url',
          {
            method: 'POST',
            body: JSON.stringify({ fileName: 'metadata.json' }),
          }
        );
        await fetch(uploadUrl, {
          method: 'PUT',
          body: JSON.stringify(metadata),
          headers: { 'Content-Type': 'application/json' },
        });
        metadataUri = finalUrl;
      }

      // Step 3: Get create-tx from Jupiter
      const params: StudioCreateTxParams = {
        creatorPubkey,
        name: form.name,
        symbol: form.symbol,
        decimals: form.decimals,
        description: form.description,
        uri: metadataUri,
        initialSupply: form.initialSupply,
        freezeAuthority: form.revokeFreeze ? null : undefined,
      };
      const { transaction, mint } = await studioCreateTx(params);

      // Step 4: Sign and send
      const sig = await signAndSend(transaction, `Create Token ${form.symbol}`);

      return { sig, mint };
    },
    onSuccess: (result) => {
      addToast({
        type: 'success',
        message: `Token created! Mint: ${result.mint.slice(0, 8)}…`,
        txSig: result.sig,
      });
    },
    onError: (err: Error) => {
      addToast({ type: 'error', message: err.message || 'Token creation failed' });
    },
  });
}
