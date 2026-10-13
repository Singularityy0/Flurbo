import SignClient from '@walletconnect/sign-client';
import { MONAD_CHAIN_ID, MONAD_TESTNET_RPC, READ_METHODS, WALLETCONNECT_PROJECT_ID, metamaskOpenUrl, metamaskSessionAddress, walletTransaction } from './mobile-wallet.ts';

type Listener = () => void;
type Session = Parameters<typeof metamaskSessionAddress>[0] & { topic: string };

const CHAIN = 'eip155:10143';
let clientPromise: Promise<InstanceType<typeof SignClient>> | undefined;
let topic: string | undefined;
const listeners = new Map<string, Set<Listener>>();

function emit(event: string) {
  listeners.get(event)?.forEach(listener => listener());
}

function client() {
  clientPromise ??= SignClient.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    metadata: {
      name: 'Flurbo',
      description: 'Individual and combined predictions on Monad testnet',
      url: 'https://flurbo.singu.online',
      icons: [],
      redirect: { native: 'flurbo://', universal: 'https://flurbo.singu.online' },
    },
  }).then(created => {
    const restore = () => {
      const sessions = created.session.getAll().filter(session => session.expiry * 1000 > Date.now());
      const session = (topic ? sessions.find(item => item.topic === topic) : sessions.at(-1)) as Session | undefined;
      try {
        const address = session && metamaskSessionAddress(session);
        topic = address ? session!.topic : undefined;
      } catch { topic = undefined; }
      emit('accountsChanged');
    };
    created.on('session_update', restore);
    created.on('session_delete', () => { topic = undefined; emit('accountsChanged'); emit('disconnect'); });
    created.on('session_expire', () => { topic = undefined; emit('accountsChanged'); });
    restore();
    return created;
  }).catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}

async function currentSession() {
  const created = await client();
  if (!topic) return undefined;
  try {
    const session = created.session.get(topic) as Session;
    metamaskSessionAddress(session);
    return session;
  } catch { topic = undefined; return undefined; }
}

function openMetaMask(uri?: string) {
  window.location.assign(metamaskOpenUrl(uri));
}

async function connect(forceNew: boolean) {
  const created = await client();
  if (!forceNew) {
    const existing = await currentSession();
    if (existing) return metamaskSessionAddress(existing);
  }
  if (topic) {
    const previous = topic;
    topic = undefined;
    await created.disconnect({ topic: previous, reason: { code: 6000, message: 'Switch wallet' } }).catch(() => undefined);
  }
  const { uri, approval } = await created.connect({
    requiredNamespaces: { eip155: { chains: [CHAIN], methods: ['eth_sendTransaction', 'personal_sign'], events: ['chainChanged', 'accountsChanged'] } },
  });
  const approved = approval();
  void approved.catch(() => undefined);
  if (uri) openMetaMask(uri);
  const session = await approved as Session;
  topic = session.topic;
  const address = metamaskSessionAddress(session);
  emit('accountsChanged');
  return address;
}

async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(MONAD_TESTNET_RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (!response.ok || body.error) throw new Error(body.error?.message || 'Monad testnet request failed.');
  return body.result;
}

function rejected(error: unknown) {
  const value = error as { code?: number; message?: string };
  return value?.code === 4001 || /reject|denied|cancel/i.test(value?.message || '');
}

async function request(args: { method: string; params?: unknown[] }) {
  const params = args.params ?? [];
  if (READ_METHODS.has(args.method)) return rpc(args.method, params);
  if (args.method === 'eth_chainId') return MONAD_CHAIN_ID;
  if (args.method === 'wallet_switchEthereumChain' || args.method === 'wallet_addEthereumChain') {
    const chainId = (params[0] as { chainId?: string } | undefined)?.chainId;
    if (chainId && chainId !== MONAD_CHAIN_ID) throw new Error('Select Monad testnet in MetaMask.');
    return null;
  }
  if (args.method === 'eth_accounts') {
    try {
      const session = await currentSession();
      return session ? [metamaskSessionAddress(session)] : [];
    } catch { return []; }
  }
  if (args.method === 'eth_requestAccounts' || args.method === 'wallet_requestPermissions') {
    return [await connect(args.method === 'wallet_requestPermissions')];
  }
  const session = await currentSession();
  const owner = session ? metamaskSessionAddress(session) : await connect(false);
  if (args.method === 'personal_sign') {
    const signer = String(params[1] || '').toLowerCase();
    if (signer !== owner) throw new Error('Wallet changed. Reconnect MetaMask.');
  } else if (args.method === 'eth_sendTransaction') {
    walletTransaction(params[0], owner);
  } else throw new Error('This wallet request is not available in the app.');
  openMetaMask();
  try {
    return await (await client()).request({ topic: topic!, chainId: CHAIN, request: { method: args.method, params } });
  } catch (error) {
    if (rejected(error)) throw Object.assign(new Error('Wallet request rejected.'), { code: 4001 });
    throw error;
  }
}

let provider: { request: typeof request; on(event: string, listener: Listener): void; removeListener(event: string, listener: Listener): void } | undefined;

export function mobileMetaMask() {
  provider ??= {
    request,
    on(event, listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event, listener) { listeners.get(event)?.delete(listener); },
  };
  return provider;
}
