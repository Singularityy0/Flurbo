export const TESTNET = Object.freeze({
  environment: 'public_testnet', chain_id: 10143, name: 'Monad testnet',
  rpc: 'https://testnet-rpc.monad.xyz', explorer: 'https://testnet.monadscan.com',
  cash: '0xa9012a055bd4e0edff8ce09f960291c09d5322dc',
  faucet: '0xd236c18d274e54faccc3dd9dda4b27965a73ee6c',
  monFaucet: 'https://faucet.monad.xyz',
  faucetSelector: '0x544c7cf9',
});

export function hostedConfig(env = process.env) {
  if (env.FLURBO_ORIGIN !== 'https://flurbo.singu.online') throw new Error('Set FLURBO_ORIGIN to the canonical HTTPS origin');
  if (env.FLURBO_NETWORK !== 'public_testnet') throw new Error('This release supports public Monad testnet only');
  const rpc = new URL(env.FLURBO_ALCHEMY_TESTNET_RPC_URL || TESTNET.rpc);
  if (rpc.protocol !== 'https:' || rpc.username || rpc.password || rpc.hash || rpc.port ||
      !['testnet-rpc.monad.xyz', 'monad-testnet.g.alchemy.com'].includes(rpc.hostname)) throw new Error('Unsupported public testnet RPC');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid server port');
  return { origin: env.FLURBO_ORIGIN, rpcUrl: rpc.href, port };
}
