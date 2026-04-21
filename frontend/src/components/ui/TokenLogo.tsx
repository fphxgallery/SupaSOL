import { useState, useEffect } from 'react';
import { TOKEN_LOGOS } from '../../config/constants';

interface TokenLogoProps {
  mint?: string;
  symbol: string;
  logoURI?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-xs',
  lg: 'w-9 h-9 text-sm',
};

// Cache Jupiter token logo lookups across renders
const jupiterLogoCache = new Map<string, string | null>();

async function fetchJupiterLogo(mint: string): Promise<string | null> {
  if (jupiterLogoCache.has(mint)) return jupiterLogoCache.get(mint)!;
  try {
    const res = await fetch(`https://api.jup.ag/tokens/v2/search?query=${mint}`);
    if (!res.ok) { jupiterLogoCache.set(mint, null); return null; }
    const data = await res.json();
    const uri = (Array.isArray(data) ? data[0]?.icon : data?.icon) ?? null;
    jupiterLogoCache.set(mint, uri);
    return uri;
  } catch {
    jupiterLogoCache.set(mint, null);
    return null;
  }
}

export function TokenLogo({ mint, symbol, logoURI, size = 'md' }: TokenLogoProps) {
  const [errored, setErrored] = useState(false);
  const [jupiterLogo, setJupiterLogo] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!mint || logoURI || TOKEN_LOGOS[mint]) return;
    setJupiterLogo(undefined);
    let cancelled = false;
    fetchJupiterLogo(mint).then(uri => { if (!cancelled) setJupiterLogo(uri); });
    return () => { cancelled = true; };
  }, [mint, logoURI]);

  const sizeClass = SIZE_CLASS[size];

  // Priority: explicit logoURI → static map → Jupiter API logo → letter fallback
  const src = !errored
    ? (logoURI || (mint ? TOKEN_LOGOS[mint] : undefined) || jupiterLogo || undefined)
    : undefined;

  if (src) {
    return (
      <img
        src={src}
        alt={symbol}
        className={`${sizeClass} rounded-full shrink-0 bg-surface-2 object-cover`}
        onError={() => setErrored(true)}
      />
    );
  }

  // Show spinner while Jupiter fetch is in-flight
  if (jupiterLogo === undefined && mint && !TOKEN_LOGOS[mint] && !logoURI) {
    return (
      <div className={`${sizeClass} rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0 animate-pulse`} />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0`}>
      <span className="font-bold text-text-dim">{symbol[0]?.toUpperCase()}</span>
    </div>
  );
}
