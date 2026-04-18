import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrice } from '../../hooks/usePrice';
import { useTokenSupply } from '../../hooks/useTokenSupply';
import { TokenLogo } from '../ui/TokenLogo';
import { formatUsd, formatUsdCompact } from '../../utils/format';
import { EXPLORER_BASE } from '../../config/constants';
import type { TokenInfo } from '../../hooks/useTokenSearch';

const QUICK_BUY_AMOUNTS = [0.01, 0.05, 0.1] as const;

interface Props {
  token: TokenInfo;
  showQuickBuy?: boolean;
}

function formatPrice(amount: number): string {
  if (amount >= 1) return formatUsd(amount);
  if (amount === 0) return '$0.00';
  // For small prices, show enough digits to be meaningful
  const decimals = Math.max(2, -Math.floor(Math.log10(amount)) + 2);
  return '$' + amount.toFixed(Math.min(decimals, 10));
}

export function TokenInfoPanel({ token, showQuickBuy = false }: Props) {
  const navigate = useNavigate();
  const { data: prices } = usePrice([token.address]);
  const price = prices?.[token.address];
  const { data: supply } = useTokenSupply(token.address);
  const [copied, setCopied] = useState(false);

  function handleQuickBuy(solAmount: number) {
    navigate(
      `/swap?outputMint=${token.address}&outputSymbol=${encodeURIComponent(token.symbol)}&amount=${solAmount}`
    );
  }

  function copyAddress() {
    navigator.clipboard.writeText(token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const audit = token.audit;
  const hasAudit = audit && (audit.isMintable != null || audit.isFreezable != null || audit.isMutable != null);

  // Compute market cap & FDV from supply × price
  const mktCap = supply?.uiAmount && price?.usdPrice
    ? supply.uiAmount * price.usdPrice
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <TokenLogo mint={token.address} symbol={token.symbol} logoURI={token.logoURI} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-text truncate">{token.name}</h2>
          </div>
          <p className="text-xs text-text-dim">{token.symbol}</p>
          {token.tags && token.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {token.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border text-text-dim">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        {token.organicScore != null && (
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-green">{typeof token.organicScore === 'number' ? token.organicScore.toFixed(1) : token.organicScore}</p>
            <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider">Organic</p>
          </div>
        )}
      </div>

      {/* ── Stats Grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="PRICE" value={price?.usdPrice != null ? formatPrice(price.usdPrice) : '—'} />
        <StatBox label="MKT CAP" value={mktCap != null ? formatUsdCompact(mktCap) : '—'} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatBox label="LIQUIDITY" value={price?.liquidity != null ? formatUsdCompact(price.liquidity) : '—'} />
        <StatBox
          label="24H CHANGE"
          value={
            price?.priceChange24h != null
              ? `${price.priceChange24h >= 0 ? '+' : ''}${price.priceChange24h.toFixed(2)}%`
              : '—'
          }
          valueClass={price?.priceChange24h != null ? (price.priceChange24h >= 0 ? 'text-green' : 'text-red') : undefined}
        />
      </div>


      {/* ── Audit ──────────────────────────────────────────────────────────── */}
      {hasAudit && (
        <div>
          <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-2">Audit</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {audit.isMintable != null && (
              <AuditFlag safe={!audit.isMintable} label={audit.isMintable ? 'Mintable' : 'Mint Disabled'} />
            )}
            {audit.isFreezable != null && (
              <AuditFlag safe={!audit.isFreezable} label={audit.isFreezable ? 'Freezable' : 'Freeze Disabled'} />
            )}
            {audit.isMutable != null && (
              <AuditFlag safe={!audit.isMutable} label={audit.isMutable ? 'Mutable' : 'Immutable'} />
            )}
          </div>
          {audit.isSus && (
            <p className="text-xs text-red mt-1.5 font-medium">This token has been flagged as suspicious</p>
          )}
          {audit.warnings && audit.warnings.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {audit.warnings.map((w, i) => (
                <p key={i} className="text-xs text-orange">{w}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Links ──────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-2">Links</p>
        <div className="flex flex-wrap gap-2">
          <LinkPill href={`${EXPLORER_BASE}/token/${token.address}`} label="Solscan" />
        </div>
      </div>

      {/* ── Token Address ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-2">Token Address</p>
        <div className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2 border border-border">
          <span className="text-xs text-text-dim truncate flex-1 font-mono">{token.address}</span>
          <button
            onClick={copyAddress}
            className="text-xs text-text-dim hover:text-text shrink-0 cursor-pointer"
            title="Copy address"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Quick Buy ──────────────────────────────────────────────────────── */}
      {showQuickBuy && (
        <div>
          <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-2">Quick Buy</p>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_BUY_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => handleQuickBuy(amt)}
                className="flex flex-col items-center gap-0.5 py-2.5 rounded-lg border border-green/20 bg-green/5 hover:bg-green hover:border-green text-green hover:text-bg transition-colors group"
              >
                <span className="text-sm font-bold">{amt}</span>
                <span className="text-[10px] font-semibold text-green/70 group-hover:text-bg/70">SOL</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2 border border-border">
      <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${valueClass ?? 'text-text'}`}>{value}</p>
    </div>
  );
}

function AuditFlag({ safe, label }: { safe: boolean; label: string }) {
  return (
    <span className={`text-xs ${safe ? 'text-green' : 'text-orange'}`}>
      {safe ? '\u2713' : '\u2717'} {label}
    </span>
  );
}

function LinkPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs px-3 py-1.5 rounded-full border border-border text-text-dim hover:text-text hover:border-text-dim transition-colors"
    >
      {label}
    </a>
  );
}
