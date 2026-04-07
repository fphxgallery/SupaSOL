import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletStore, useActivePublicKey } from '../../store/walletStore';
import { useUiStore } from '../../store/uiStore';
import { useTokenSearch } from '../../hooks/useTokenSearch';
import { shortenPubkey } from '../../utils/format';
import { Button } from '../ui/Button';
import { CreateWalletModal } from '../wallet/CreateWalletModal';
import { ImportWalletModal } from '../wallet/ImportWalletModal';

function TokenLogo({ logoURI, symbol }: { logoURI?: string; symbol: string }) {
  const [errored, setErrored] = useState(false);

  if (logoURI && !errored) {
    return (
      <img
        src={logoURI}
        alt={symbol}
        className="w-7 h-7 rounded-full shrink-0 bg-surface-2 object-cover"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-text-dim">{symbol[0]?.toUpperCase()}</span>
    </div>
  );
}

function TokenSearchBar() {
  const navigate = useNavigate();
  const [open, setOpen]         = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  const { query, setQuery, tokens, isLoading } = useTokenSearch();

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(mint: string, symbol: string) {
    navigate(`/swap?inputMint=${mint}&inputSymbol=${encodeURIComponent(symbol)}`);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  const showDropdown = open && query.length >= 2;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      {/* Search input */}
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2 focus-within:border-green/50 transition-colors">
        <svg className="w-3.5 h-3.5 text-text-dim shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search tokens…"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-text-dim outline-none min-w-0"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); }}
            className="text-text-dim hover:text-text transition-colors text-xs shrink-0"
          >✕</button>
        )}
        {isLoading && (
          <span className="text-text-dim text-xs animate-pulse shrink-0">…</span>
        )}
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {tokens.length === 0 && !isLoading ? (
            <p className="text-sm text-text-dim text-center py-4">No tokens found</p>
          ) : (
            tokens.map((token) => (
              <button
                key={token.address}
                onClick={() => handleSelect(token.address, token.symbol)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors text-left border-b border-border last:border-0"
              >
                {/* Logo */}
                <TokenLogo logoURI={token.logoURI} symbol={token.symbol} />

                {/* Name + symbol */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-text truncate">{token.symbol}</span>
                    {token.audit?.isSus && (
                      <span className="text-orange text-xs shrink-0" title="Flagged token">⚠</span>
                    )}
                  </div>
                  <p className="text-xs text-text-dim truncate">{token.name}</p>
                </div>

                {/* Volume */}
                {token.daily_volume != null && (
                  <span className="text-xs text-text-dim shrink-0">
                    ${(token.daily_volume / 1_000_000).toFixed(1)}M
                  </span>
                )}

                {/* Swap arrow hint */}
                <span className="text-text-dim text-xs shrink-0">→ Swap</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const pubkey              = useActivePublicKey();
  const clearKeypair        = useWalletStore((s) => s.clearKeypair);
  const addToast            = useUiStore((s) => s.addToast);
  const openMobileSidebar   = useUiStore((s) => s.openMobileSidebar);
  const [showCreate, setShowCreate]         = useState(false);
  const [showImport, setShowImport]         = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);

  function copyAddress() {
    if (!pubkey) return;
    navigator.clipboard.writeText(pubkey);
    addToast({ type: 'success', message: 'Address copied' });
  }

  return (
    <>
      <header className="flex items-center gap-3 px-4 h-14 border-b border-border bg-surface shrink-0">

        {/* Mobile hamburger — only visible below md */}
        <button
          onClick={openMobileSidebar}
          className="md:hidden text-text-dim hover:text-text transition-colors p-1.5 rounded-md hover:bg-surface-2 shrink-0"
          aria-label="Open menu"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Token search — takes up remaining center space */}
        <TokenSearchBar />

        {/* Right: Wallet */}
        <div className="flex items-center gap-2 shrink-0">
          {pubkey ? (
            <div className="relative">
              <button
                onClick={() => setShowWalletMenu((v) => !v)}
                className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-text hover:border-border-2 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-green" />
                <span className="font-mono">{shortenPubkey(pubkey)}</span>
                <span className="text-text-dim text-xs">▾</span>
              </button>
              {showWalletMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-xl shadow-xl z-20 py-1">
                  <button
                    onClick={() => { copyAddress(); setShowWalletMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
                  >
                    Copy Address
                  </button>
                  <a
                    href={`https://solscan.io/account/${pubkey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 text-sm text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
                    onClick={() => setShowWalletMenu(false)}
                  >
                    View on Solscan ↗
                  </a>
                  <hr className="border-border my-1" />
                  <button
                    onClick={() => { clearKeypair(); setShowWalletMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-red hover:bg-red/10 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                Import
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                Create Wallet
              </Button>
            </div>
          )}
        </div>
      </header>

      <CreateWalletModal open={showCreate} onClose={() => setShowCreate(false)} />
      <ImportWalletModal open={showImport} onClose={() => setShowImport(false)} />
    </>
  );
}
