import { useState } from 'react';

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

export function TokenLogo({ mint, symbol, logoURI, size = 'md' }: TokenLogoProps) {
  const [errored, setErrored] = useState(false);

  // Priority: explicit logoURI → Jupiter CDN by mint → letter fallback
  const src = !errored
    ? (logoURI || (mint ? `https://img.jup.ag/tokens/${mint}` : undefined))
    : undefined;

  const sizeClass = SIZE_CLASS[size];

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

  return (
    <div className={`${sizeClass} rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0`}>
      <span className="font-bold text-text-dim">{symbol[0]?.toUpperCase()}</span>
    </div>
  );
}
