import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  jupiterApiKey: required('JUPITER_API_KEY'),
  port: parseInt(process.env['PORT'] ?? '4000', 10),
  frontendOrigin: process.env['FRONTEND_ORIGIN'] ?? 'http://localhost:5173',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  solanaRpcUrl: process.env['SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com',
};
