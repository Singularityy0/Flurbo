declare module '*.mjs' {
  export function supportedDeployment(state: unknown): boolean;
  export const TESTNET: { environment: string; chain_id: number; name: string; rpc: string; explorer: string; cash: string; faucet: string; monFaucet: string; faucetSelector: string };
  export class WalletError extends Error {}
  export function mountDashboard(root: ShadowRoot, options?: { account?: string; consumer?: boolean; credentials?: string; providers?: {name: string; provider: unknown}[]; onSnapshot?: (data: unknown) => void }): () => void;
}
