import { useState, useRef, useEffect } from 'react';
import { useTokenSearch, type TokenInfo } from '../../hooks/useTokenSearch';

interface Props {
  value: TokenInfo | null;
  onChange: (token: TokenInfo) => void;
  placeholder?: string;
  label?: string;
}

function TokenRow({ token }: { token: TokenInfo }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 cursor-pointer transition-colors">
      {token.logoURI ? (
        <img src={token.logoURI} alt={token.symbol} className="w-7 h-7 rounded-full shrink-0 bg-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <div className="w-7 h-7 rounded-full bg-border-2 flex items-center justify-center shrink-0">
          <span className="text-xs text-text-dim">{token.symbol?.[0]}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-text truncate">{token.symbol}</span>
          {token.audit?.isSus && (
            <span className="text-xs text-orange" title="Flagged as suspicious">⚠</span>
          )}
        </div>
        <span className="text-xs text-text-dim truncate block">{token.name}</span>
      </div>
      {token.daily_volume !== undefined && (
        <span className="text-xs text-text-dim shrink-0">
          ${(token.daily_volume / 1000).toFixed(0)}K
        </span>
      )}
    </div>
  );
}

export function TokenSearchPanel({ value, onChange, placeholder = 'Search tokens...', label }: Props) {
  const [open, setOpen] = useState(false);
  const { query, setQuery, tokens, isLoading } = useTokenSearch();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSelect(token: TokenInfo) {
    onChange(token);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="block text-xs text-text-dim font-medium mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm hover:border-border-2 transition-colors w-full text-left"
      >
        {value ? (
          <>
            {value.logoURI && (
              <img src={value.logoURI} alt={value.symbol} className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <span className="font-medium text-text">{value.symbol}</span>
            <span className="text-text-dim text-xs truncate flex-1">{value.name}</span>
          </>
        ) : (
          <span className="text-text-dim">{placeholder}</span>
        )}
        <span className="text-text-dim ml-auto shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or mint address..."
              className="w-full bg-surface-2 border border-border rounded-lg text-sm text-text placeholder-muted px-3 py-2 focus:outline-none focus:border-blue"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-text-dim">
                <span className="animate-spin mr-2">⟳</span> Searching...
              </div>
            ) : tokens.length === 0 && query.length >= 2 ? (
              <div className="py-6 text-center text-sm text-text-dim">No tokens found</div>
            ) : tokens.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-dim">Type to search tokens</div>
            ) : (
              tokens.map((token) => (
                <div key={token.address} onClick={() => handleSelect(token)}>
                  <TokenRow token={token} />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
