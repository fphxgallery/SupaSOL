import { apiFetch } from './client';

export interface CraftSendParams {
  senderPubkey: string;
  recipientPubkey?: string; // if undefined, creates invite code
  mint: string;
  amount: number; // base units
  memo?: string;
}

export interface CraftSendResponse {
  transaction: string;         // base64 VersionedTransaction
  inviteKeypairBase58?: string; // present for invite-based sends
  inviteCode?: string;
}

export interface CraftClawbackParams {
  senderPubkey: string;
  inviteCode: string;
}

export interface CraftClawbackResponse {
  transaction: string;
}

export interface PendingInvite {
  inviteCode: string;
  mint: string;
  amount: string;
  createdAt: string;
  expiresAt?: string;
}

export interface PendingInvitesResponse {
  invites: PendingInvite[];
}

export interface InviteHistoryEntry {
  inviteCode: string;
  mint: string;
  amount: string;
  status: 'claimed' | 'expired' | 'clawed_back';
  createdAt: string;
  claimedAt?: string;
}

export interface InviteHistoryResponse {
  history: InviteHistoryEntry[];
}

export async function craftSend(params: CraftSendParams): Promise<CraftSendResponse> {
  return apiFetch<CraftSendResponse>('/api/send/craft-send', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function craftClawback(params: CraftClawbackParams): Promise<CraftClawbackResponse> {
  return apiFetch<CraftClawbackResponse>('/api/send/craft-clawback', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchPendingInvites(walletPubkey: string): Promise<PendingInvitesResponse> {
  return apiFetch<PendingInvitesResponse>(`/api/send/pending-invites?walletPubkey=${walletPubkey}`);
}

export async function fetchInviteHistory(walletPubkey: string): Promise<InviteHistoryResponse> {
  return apiFetch<InviteHistoryResponse>(`/api/send/invite-history?walletPubkey=${walletPubkey}`);
}
