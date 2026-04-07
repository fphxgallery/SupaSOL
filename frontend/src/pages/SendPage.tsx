import { useState } from 'react';
import { useActivePublicKey } from '../store/walletStore';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { usePendingInvites, useInviteHistory, useSendInvite, useClawback } from '../hooks/useSend';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatUsd, shortenPubkey, timeAgo } from '../utils/format';
import { MINTS } from '../config/constants';

const KNOWN_MINTS: Record<string, { symbol: string; decimals: number }> = {
  [MINTS.SOL]:  { symbol: 'SOL',  decimals: 9 },
  [MINTS.USDC]: { symbol: 'USDC', decimals: 6 },
  [MINTS.USDT]: { symbol: 'USDT', decimals: 6 },
  [MINTS.JUP]:  { symbol: 'JUP',  decimals: 6 },
};

const STATUS_VARIANT: Record<string, 'green' | 'muted' | 'red'> = {
  claimed: 'green', expired: 'muted', clawed_back: 'red',
};

export function SendPage() {
  const pubkey = useActivePublicKey();
  const { data: tokenBalances } = useTokenBalances(pubkey);
  const { data: pendingResp, isLoading: loadingPending } = usePendingInvites(pubkey);
  const { data: historyResp } = useInviteHistory(pubkey);
  const { mutateAsync: sendInvite, isPending: sending } = useSendInvite();
  const { mutateAsync: clawback, isPending: clawingBack, variables: clawbackVars } = useClawback();

  const [selectedMint, setSelectedMint] = useState<string>(MINTS.USDC);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = pendingResp?.invites ?? [];
  const history = historyResp?.history ?? [];

  // Build list of sendable tokens (SPL + SOL)
  const sendableTokens = [
    { mint: MINTS.SOL, symbol: 'SOL', decimals: 9, uiAmount: null },
    ...(tokenBalances ?? []).map((b) => ({
      mint: b.mint,
      symbol: KNOWN_MINTS[b.mint]?.symbol ?? shortenPubkey(b.mint, 4),
      decimals: b.decimals,
      uiAmount: b.uiAmount,
    })),
  ];

  const selectedToken = sendableTokens.find((t) => t.mint === selectedMint) ?? sendableTokens[0];

  async function handleSend() {
    if (!pubkey || !amount || parseFloat(amount) <= 0) return;
    const decimals = selectedToken?.decimals ?? 6;
    const baseUnits = Math.floor(parseFloat(amount) * Math.pow(10, decimals));
    const result = await sendInvite({
      walletPubkey: pubkey,
      mint: selectedMint,
      amount: baseUnits,
      memo: memo || undefined,
    });
    if (result.inviteCode) {
      setLastInviteCode(result.inviteCode);
    }
    setAmount('');
    setMemo('');
  }

  async function copyInvite() {
    if (!lastInviteCode) return;
    await navigator.clipboard.writeText(lastInviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const formValid = !!pubkey && !!amount && parseFloat(amount) > 0;

  if (!pubkey) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <p className="text-text-dim">Connect a wallet to use Send</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-text">Send</h1>
        <Badge variant="blue">Jupiter Send v1</Badge>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue/10 border border-blue/20 rounded-xl p-4">
        <span className="text-blue text-lg mt-0.5">ℹ</span>
        <div>
          <p className="text-sm text-blue font-medium">Invite-based token sending</p>
          <p className="text-xs text-text-dim mt-0.5">
            Send tokens via a unique invite code. Recipients claim via Jupiter Mobile or any Jupiter-compatible app. You can clawback unclaimed sends at any time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Send form */}
        <Card className="lg:col-span-1">
          <CardHeader title="Create Send" subtitle="Generates a claimable invite code" />
          <CardBody className="flex flex-col gap-4">
            {/* Token selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-dim font-medium">Token</label>
              <div className="flex flex-wrap gap-1.5">
                {sendableTokens.slice(0, 6).map((t) => (
                  <button
                    key={t.mint}
                    onClick={() => setSelectedMint(t.mint)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium cursor-pointer transition-colors ${
                      selectedMint === t.mint
                        ? 'bg-blue/10 text-blue border border-blue/20'
                        : 'bg-surface-2 text-text-dim border border-border hover:text-text'
                    }`}
                  >
                    {t.symbol}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label={`Amount (${selectedToken?.symbol ?? ''})`}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              suffix={selectedToken?.symbol}
            />

            <Input
              label="Memo (optional)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Happy Birthday!"
            />

            <Button onClick={handleSend} loading={sending} disabled={!formValid} className="w-full">
              Create Invite Send
            </Button>

            {/* Invite code result */}
            {lastInviteCode && (
              <div className="flex flex-col gap-2 bg-green/5 border border-green/20 rounded-xl p-3">
                <p className="text-xs text-green font-medium">Invite code created!</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-text font-mono bg-surface-2 rounded p-2 break-all">
                    {lastInviteCode}
                  </code>
                  <Button variant="secondary" size="sm" onClick={copyInvite}>
                    {copied ? '✓' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-text-dim">Share this code with the recipient. They can claim it on Jupiter Mobile.</p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Pending invites */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Pending Invites"
            subtitle={`${pending.length} unclaimed`}
          />
          <CardBody className="p-0">
            {loadingPending ? (
              <div className="flex items-center justify-center py-8 text-text-dim">
                <span className="animate-spin mr-2">⟳</span>
                <span className="text-sm">Loading...</span>
              </div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-text-dim text-center py-8">No pending invites</p>
            ) : (
              pending.map((invite) => (
                <div
                  key={invite.inviteCode}
                  className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <code className="text-xs text-text font-mono truncate max-w-[180px]">
                      {invite.inviteCode}
                    </code>
                    <p className="text-xs text-text-dim">
                      {KNOWN_MINTS[invite.mint]?.symbol ?? shortenPubkey(invite.mint, 4)}
                      {' · '}
                      {(parseFloat(invite.amount) / Math.pow(10, KNOWN_MINTS[invite.mint]?.decimals ?? 6)).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                      {' · '}
                      {timeAgo(new Date(invite.createdAt).getTime())}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => clawback({ senderPubkey: pubkey!, inviteCode: invite.inviteCode })}
                    loading={clawingBack && clawbackVars?.inviteCode === invite.inviteCode}
                  >
                    Clawback
                  </Button>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader title="Send History" subtitle={`${history.length} invites`} />
          <CardBody className="p-0">
            {history.map((entry) => (
              <div
                key={entry.inviteCode + entry.createdAt}
                className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0"
              >
                <div className="flex flex-col gap-0.5">
                  <code className="text-xs text-text font-mono">{entry.inviteCode.slice(0, 16)}…</code>
                  <p className="text-xs text-text-dim">
                    {KNOWN_MINTS[entry.mint]?.symbol ?? shortenPubkey(entry.mint, 4)}
                    {' · '}
                    {(parseFloat(entry.amount) / Math.pow(10, KNOWN_MINTS[entry.mint]?.decimals ?? 6)).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    {' · '}
                    {timeAgo(new Date(entry.createdAt).getTime())}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[entry.status] ?? 'muted'}>
                  {entry.status.replace('_', ' ')}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
