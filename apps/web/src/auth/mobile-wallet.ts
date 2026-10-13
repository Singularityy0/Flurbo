// Rules for the native app's MetaMask session. Reads use the public testnet; only MetaMask may sign or send.
export const MONAD_CHAIN_ID = '0x279f';
export const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';
// Public Reown project id, the same one the retired preview used. It is not a key.
export const WALLETCONNECT_PROJECT_ID = '0cad064df31aeae313f0ab3ee7620ed7';
export const READ_METHODS = new Set(['eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_getBalance', 'eth_getCode', 'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_blockNumber']);

type WalletSession = {
  peer?: { metadata?: { name?: string; url?: string } };
  expiry: number;
  namespaces: Record<string, { accounts: string[]; methods: string[]; events: string[] }>;
};

export function metamaskSessionAddress(session: WalletSession, now = Date.now()) {
  // MetaMask Mobile's WalletConnect peer is named "MetaMask Wallet" at https://metamask.io/.
  if (!/^MetaMask(?: Wallet|: Web3 Wallet| Mobile)?$/i.test(session.peer?.metadata?.name ?? '') || !/^https:\/\/(?:[a-z0-9-]+\.)?metamask\.io(?:\/|$)/i.test(session.peer?.metadata?.url ?? '')) throw new Error('Only MetaMask is supported for trading. Reconnect MetaMask.');
  const ns = session.namespaces.eip155;
  if (session.expiry * 1000 <= now || !ns?.methods.includes('eth_sendTransaction')) throw new Error('Reconnect MetaMask on Monad testnet.');
  const accounts = ns.accounts.filter(account => /^eip155:10143:0x[0-9a-f]{40}$/i.test(account));
  if (accounts.length !== 1) throw new Error('Select one MetaMask account on Monad testnet.');
  return accounts[0].split(':')[2].toLowerCase();
}

export function walletTransaction(value: unknown, owner: string) {
  const tx = value as Record<string, unknown>;
  if (!tx || typeof tx.from !== 'string' || tx.from.toLowerCase() !== owner ||
    typeof tx.to !== 'string' || !/^0x[0-9a-f]{40}$/i.test(tx.to) ||
    BigInt(String(tx.chainId)) !== 10143n || BigInt(String(tx.value ?? '0x0')) !== 0n ||
    typeof tx.data !== 'string' || !/^0x([0-9a-f]{2})*$/i.test(tx.data)) throw new Error('Wallet transaction does not match this testnet account.');
  return tx;
}

export function metamaskOpenUrl(uri?: string, _userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  // An intent:// link never leaves the Android WebView. The https app link does:
  // the phone browser opens MetaMask, and the Flurbo app hands this host to the MetaMask app.
  return uri ? `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}` : 'https://metamask.app.link/';
}
