export type BrowserWallet = { name: string; provider: { request(args: {method: string; params?: unknown[]}): Promise<unknown> } };

export function discoverWallets(receive: (wallet: BrowserWallet) => void) {
  const seen = new Set<unknown>();
  const add = (wallet: BrowserWallet) => {
    if (!wallet?.provider?.request || seen.has(wallet.provider)) return;
    seen.add(wallet.provider); receive({ ...wallet, name: String(wallet.name || 'Browser wallet').slice(0, 60) });
  };
  const announced = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail) add({ name: detail.info?.name, provider: detail.provider });
  };
  window.addEventListener('eip6963:announceProvider', announced);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  const injected = (window as unknown as {ethereum?: BrowserWallet['provider']}).ethereum;
  if (injected) add({ name: 'Browser wallet', provider: injected });
  return () => window.removeEventListener('eip6963:announceProvider', announced);
}
