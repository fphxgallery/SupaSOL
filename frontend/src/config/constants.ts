export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
export const CLUSTER = (import.meta.env.VITE_CLUSTER ?? 'mainnet-beta') as 'mainnet-beta' | 'devnet';

export const EXPLORER_BASE = 'https://solscan.io';

export const MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  JUPSOL: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v',
  JUPMOBILE: 'MoB9LrWCmYMFEhcKtRiLZfEFdcU3TonJwHwBa5A9Eqk',
} as const;

export const LEND_PROGRAMS = {
  EARN: 'jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9',
  BORROW: 'jupr81YtYssSyPt8jbnGuiWon5f6x9TcDEFxYe3Bdzi',
} as const;

export const LOCK_PROGRAM = 'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn';
