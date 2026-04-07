/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_CLUSTER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
