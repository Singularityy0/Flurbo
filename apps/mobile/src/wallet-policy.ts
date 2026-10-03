export const REOWN_PROJECT_ID = '0cad064df31aeae313f0ab3ee7620ed7';
export const CHAIN = 'eip155:10143';
export function walletSessionChanged(event: { name?: string; data?: unknown }, selected: string): boolean {
  if (event.name === 'chainChanged') {
    try { return BigInt(String(event.data)) !== 10143n; } catch { return true; }
  }
  if (event.name === 'accountsChanged') {
    return !Array.isArray(event.data) || !event.data.some(account =>
      typeof account === 'string' && account.toLowerCase() === selected.toLowerCase());
  }
  return false;
}
export function sessionAddress(session: { peer?: { metadata?: { name?: string; url?: string } }; expiry: number; namespaces: Record<string, { accounts: string[]; methods: string[]; events: string[] }> }, now = Date.now()) {
  // Metadata is self-reported, so this is a product filter, not brand attestation.
  // Accept MetaMask's mobile app-link host as well as its website host.
  const name = session.peer?.metadata?.name?.trim() ?? '';
  let host = '';
  try { host = new URL(session.peer?.metadata?.url ?? '').hostname.toLowerCase(); } catch { /* Missing or invalid metadata. */ }
  const metaMaskName = /^MetaMask(?:$|[ :\-])/i.test(name);
  const metaMaskHost = host === 'metamask.io' || host.endsWith('.metamask.io') || host === 'metamask.app.link';
  if (!metaMaskName || !metaMaskHost) throw new Error(`Only MetaMask is supported for trading. Wallet reported ${name || 'no name'} at ${host || 'no URL host'}.`);
  const ns = session.namespaces.eip155;
  if (session.expiry * 1000 <= now || !ns?.methods.includes('eth_sendTransaction')) throw new Error('Reconnect MetaMask on Monad testnet.');
  const accounts = ns.accounts.filter(a => /^eip155:10143:0x[0-9a-f]{40}$/i.test(a));
  if (accounts.length !== 1) throw new Error('Select one MetaMask account on Monad testnet.');
  return accounts[0].split(':')[2].toLowerCase();
}
export function checkWalletTransaction(value: unknown, owner: string) {
  const tx = value as Record<string, unknown>;
  if (!tx || typeof tx.from !== 'string' || tx.from.toLowerCase() !== owner ||
    typeof tx.to !== 'string' || !/^0x[0-9a-f]{40}$/i.test(tx.to) ||
    BigInt(String(tx.chainId)) !== 10143n || BigInt(String(tx.value ?? '0x0')) !== 0n ||
    typeof tx.data !== 'string' || !/^0x([0-9a-f]{2})*$/i.test(tx.data)) throw new Error('Wallet transaction does not match this testnet account.');
  return tx;
}
