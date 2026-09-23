declare module '*.mjs' {
  export class WalletError extends Error {}
  export function mountDashboard(root: ShadowRoot, options?: { account?: string; consumer?: boolean; credentials?: string; providers?: {name: string; provider: unknown}[]; onSnapshot?: (data: unknown) => void }): () => void;
}
